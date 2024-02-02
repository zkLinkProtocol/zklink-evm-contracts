// SPDX-License-Identifier: MIT OR Apache-2.0

pragma solidity ^0.8.0;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {AddressAliasHelper} from "./zksync/l1-contracts/vendor/AddressAliasHelper.sol";
import {IZkLink} from "./interfaces/IZkLink.sol";
import {IL2Gateway} from "./interfaces/IL2Gateway.sol";
import {IMailbox, TxStatus} from "./zksync/l1-contracts/zksync/interfaces/IMailbox.sol";
import {IAdmin} from "./zksync/l1-contracts/zksync/interfaces/IAdmin.sol";
import {IZkSync} from "./zksync/l1-contracts/zksync/interfaces/IZkSync.sol";
import {Merkle} from "./zksync/l1-contracts/zksync/libraries/Merkle.sol";
import "./zksync/l1-contracts/zksync/Storage.sol";
import "./zksync/l1-contracts/zksync/Config.sol";
import "./zksync/l1-contracts/common/L2ContractAddresses.sol";

/// @title ZkLink contract
/// @author zk.link
contract ZkLink is IZkLink, IMailbox, IAdmin, OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    /// @notice The gateway is used for communicating with L1
    IL2Gateway public gateway;
    /// @notice List of permitted validators
    mapping(address validatorAddress => bool isValidator) public validators;
    /// @dev The white list allow to send request L2 request
    mapping(address contractAddress => bool isPermitToSendL2Request) public allowLists;
    /// @dev Gas price of primary chain
    uint256 public txGasPrice;
    /// @dev Fee params used to derive gasPrice for the L1->L2 transactions. For L2 transactions,
    /// the bootloader gives enough freedom to the operator.
    FeeParams public feeParams;
    /// @dev The total number of priority operations that were added to the priority queue
    uint256 public totalPriorityTxs;
    /// @dev The total number of synced priority operations
    uint256 public totalSyncedPriorityTxs;
    /// @dev The sync status for each priority operation
    mapping(uint256 priorityOpId => SecondaryChainSyncStatus) public priorityOpSyncStatus;
    /// @notice Total number of executed batches i.e. batches[totalBatchesExecuted] points at the latest executed batch
    /// (batch 0 is genesis)
    uint256 public totalBatchesExecuted;
    /// @dev Stored root hashes of L2 -> L1 logs
    mapping(uint256 batchNumber => bytes32 l2LogsRootHash) public l2LogsRootHashes;
    /// @dev Stored the l2 tx hash map from secondary chain to primary chain
    mapping(bytes32 l2TxHash => bytes32 primaryChainL2TxHash) public l2TxHashMap;

    /// @notice Gateway init
    event InitGateway(IL2Gateway gateway);
    /// @notice Contract's permit status changed
    event ContractAllowStatusUpdate(address contractAddress, bool isPermit);
    /// @notice Tx gas price changed
    event TxGasPriceUpdate(uint256 oldTxGasPrice, uint256 newTxGasPrice);
    /// @notice Validator's status changed
    event ValidatorStatusUpdate(address validatorAddress, bool isActive);
    /// @notice Fee params for L1->L2 transactions changed
    event NewFeeParams(FeeParams oldFeeParams, FeeParams newFeeParams);
    /// @notice New priority request event. Emitted when a request is placed into the priority queue
    event NewPriorityRequest(uint256 priorityOpId, ForwardL2Request l2Request);
    /// @notice Emitted send sync status to primary chain.
    event SyncL2Requests(uint256 totalSyncedPriorityTxs, bytes32 syncHash, uint256 forwardEthAmount);
    /// @notice Emitted when receive batch root from primary chain.
    event SyncBatchRoot(uint256 batchNumber, bytes32 l2LogsRootHash);
    /// @notice Emitted when receive l2 tx hash from primary chain.
    event SyncL2TxHash(bytes32 l2TxHash, bytes32 primaryChainL2TxHash);

    /// @notice Check if msg sender is gateway
    modifier onlyGateway() {
        require(msg.sender == address(gateway), "Not gateway");
        _;
    }

    /// @notice Checks if validator is active
    modifier onlyValidator() {
        require(validators[msg.sender], "Not validator"); // validator is not active
        _;
    }

    function initialize() external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __Pausable_init();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /// @dev Pause the contract, can only be called by the owner
    function pause() external onlyOwner {
        _pause();
    }

    /// @dev Unpause the contract, can only be called by the owner
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @dev Init gateway, can only be called by the owner
    function setGateway(IL2Gateway _gateway) external onlyOwner {
        require(address(gateway) == address(0), "Duplicate init gateway");
        gateway = _gateway;
        emit InitGateway(_gateway);
    }

    /// @dev Update the permit status of contract, can only be called by the owner
    function setAllowList(address _contractAddress, bool _permitted) external onlyOwner {
        allowLists[_contractAddress] = _permitted;
        emit ContractAllowStatusUpdate(_contractAddress, _permitted);
    }

    /// @dev Update the tx gas price
    function setTxGasPrice(uint256 _newTxGasPrice) external onlyOwner {
        uint256 oldTxGasPrice = txGasPrice;
        txGasPrice = _newTxGasPrice;
        emit TxGasPriceUpdate(oldTxGasPrice, _newTxGasPrice);
    }

    function setValidator(address _validator, bool _active) external onlyGateway {
        validators[_validator] = _active;
        emit ValidatorStatusUpdate(_validator, _active);
    }

    function changeFeeParams(FeeParams calldata _newFeeParams) external onlyGateway {
        // Double checking that the new fee params are valid, i.e.
        // the maximal pubdata per batch is not less than the maximal pubdata per priority transaction.
        require(_newFeeParams.maxPubdataPerBatch >= _newFeeParams.priorityTxMaxPubdata, "n6");

        FeeParams memory oldFeeParams = feeParams;
        feeParams = _newFeeParams;

        emit NewFeeParams(oldFeeParams, _newFeeParams);
    }

    function l2TransactionBaseCost(
        uint256 _gasPrice,
        uint256 _l2GasLimit,
        uint256 _l2GasPerPubdataByteLimit
    ) public view returns (uint256) {
        uint256 l2GasPrice = _deriveL2GasPrice(_gasPrice, _l2GasPerPubdataByteLimit);
        return l2GasPrice * _l2GasLimit;
    }

    function requestL2Transaction(
        address _contractL2,
        uint256 _l2Value,
        bytes calldata _calldata,
        uint256 _l2GasLimit,
        uint256 _l2GasPerPubdataByteLimit,
        bytes[] calldata _factoryDeps,
        address _refundRecipient
    ) external payable nonReentrant whenNotPaused returns (bytes32 canonicalTxHash){
        // Change the sender address if it is a smart contract to prevent address collision between L1 and L2.
        // Please note, currently zkSync address derivation is different from Ethereum one, but it may be changed in the future.
        address sender = msg.sender;
        bool isContractCall = false;
        if (sender != tx.origin) {
            // Check contract call is allowed for safe reasons
            require(allowLists[sender], "Not allow to send L2 request");
            sender = AddressAliasHelper.applyL1ToL2Alias(msg.sender);
            isContractCall = true;
        } else {
            // Temporarily prohibit contract calls from EOA address for safe reasons
            require(_calldata.length == 0, "Not allow to call contract");
        }

        // Enforcing that `_l2GasPerPubdataByteLimit` equals to a certain constant number. This is needed
        // to ensure that users do not get used to using "exotic" numbers for _l2GasPerPubdataByteLimit, e.g. 1-2, etc.
        // VERY IMPORTANT: nobody should rely on this constant to be fixed and every contract should give their users the ability to provide the
        // ability to provide `_l2GasPerPubdataByteLimit` for each independent transaction.
        // CHANGING THIS CONSTANT SHOULD BE A CLIENT-SIDE CHANGE.
        require(_l2GasPerPubdataByteLimit == REQUIRED_L2_GAS_PRICE_PER_PUBDATA, "Invalid l2GasPerPubdataByteLimit");
        require(_factoryDeps.length <= MAX_NEW_FACTORY_DEPS, "Invalid factoryDeps");

        // Checking that the user provided enough ether to pay for the transaction.
        uint256 l2GasPrice = _deriveL2GasPrice(txGasPrice, _l2GasPerPubdataByteLimit);
        uint256 baseCost = l2GasPrice * _l2GasLimit;
        require(msg.value == baseCost + _l2Value, "Invalid msg value"); // The `msg.value` doesn't cover the transaction cost

        // If the `_refundRecipient` is not provided, we use the `sender` as the recipient.
        address refundRecipient = _refundRecipient == address(0) ? sender : _refundRecipient;
        // If the `_refundRecipient` is a smart contract, we apply the L1 to L2 alias to prevent foot guns.
        if (refundRecipient.code.length > 0) {
            refundRecipient = AddressAliasHelper.applyL1ToL2Alias(refundRecipient);
        }

        // Build l2 request params
        uint256 _totalPriorityTxs = totalPriorityTxs;
        ForwardL2Request memory request = ForwardL2Request(
            gateway.getRemoteGateway(),
            isContractCall,
            sender,
            _totalPriorityTxs,
            _contractL2,
            _l2Value,
            _calldata,
            _l2GasLimit,
            _l2GasPerPubdataByteLimit,
            _factoryDeps,
            refundRecipient
        );
        canonicalTxHash = keccak256(abi.encode(request));

        // Accumulate sync status
        SecondaryChainSyncStatus memory syncStatus;
        if (_totalPriorityTxs == 0) {
            syncStatus.hash = canonicalTxHash;
            syncStatus.amount = _l2Value;
        } else {
            syncStatus = priorityOpSyncStatus[_totalPriorityTxs - 1];
            syncStatus.hash = keccak256(abi.encodePacked(syncStatus.hash, canonicalTxHash));
            syncStatus.amount = syncStatus.amount + _l2Value;
        }
        priorityOpSyncStatus[_totalPriorityTxs] = syncStatus;
        totalPriorityTxs = _totalPriorityTxs + 1;

        emit NewPriorityRequest(request.txId, request);
    }

    function proveL2MessageInclusion(
        uint256 _batchNumber,
        uint256 _index,
        L2Message memory _message,
        bytes32[] calldata _proof
    ) public view returns (bool) {
        return _proveL2LogInclusion(_batchNumber, _index, _L2MessageToLog(_message), _proof);
    }

    function proveL1ToL2TransactionStatus(
        bytes32 _l2TxHash,
        uint256 _l2BatchNumber,
        uint256 _l2MessageIndex,
        uint16 _l2TxNumberInBatch,
        bytes32[] calldata _merkleProof,
        TxStatus _status
    ) public view returns (bool) {
        // Get l2 tx hash on primary chain
        bytes32 primaryChainL2TxHash = l2TxHashMap[_l2TxHash];
        require(primaryChainL2TxHash != bytes32(0), "Invalid l2 tx hash");

        // Bootloader sends an L2 -> L1 log only after processing the L1 -> L2 transaction.
        // Thus, we can verify that the L1 -> L2 transaction was included in the L2 batch with specified status.
        //
        // The semantics of such L2 -> L1 log is always:
        // - sender = L2_BOOTLOADER_ADDRESS
        // - key = hash(L1ToL2Transaction)
        // - value = status of the processing transaction (1 - success & 0 - fail)
        // - isService = true (just a conventional value)
        // - l2ShardId = 0 (means that L1 -> L2 transaction was processed in a rollup shard, other shards are not available yet anyway)
        // - txNumberInBatch = number of transaction in the batch
        L2Log memory l2Log = L2Log({
            l2ShardId: 0,
            isService: true,
            txNumberInBatch: _l2TxNumberInBatch,
            sender: L2_BOOTLOADER_ADDRESS,
            key: primaryChainL2TxHash,
            value: bytes32(uint256(_status))
        });
        return _proveL2LogInclusion(_l2BatchNumber, _l2MessageIndex, l2Log, _merkleProof);
    }

    function syncL2Requests(uint256 _newTotalSyncedPriorityTxs) external payable onlyValidator {
        // Check newTotalSyncedPriorityTxs
        require(_newTotalSyncedPriorityTxs <= totalPriorityTxs && _newTotalSyncedPriorityTxs > totalSyncedPriorityTxs, "Invalid newTotalSyncedPriorityTxs");

        // Forward eth amount is the difference of two accumulate amount
        SecondaryChainSyncStatus memory lastSyncStatus;
        if (totalSyncedPriorityTxs > 0) {
            lastSyncStatus = priorityOpSyncStatus[totalSyncedPriorityTxs - 1];
        }
        SecondaryChainSyncStatus memory currentSyncStatus = priorityOpSyncStatus[_newTotalSyncedPriorityTxs - 1];
        uint256 forwardAmount = currentSyncStatus.amount - lastSyncStatus.amount;

        // Update synced priority txs
        totalSyncedPriorityTxs = _newTotalSyncedPriorityTxs;

        // Send sync status to L1 gateway
        bytes memory callData = abi.encodeCall(IZkSync.syncL2Requests, (gateway.getRemoteGateway(), _newTotalSyncedPriorityTxs, currentSyncStatus.hash, forwardAmount));
        gateway.sendMessage{value: msg.value + forwardAmount}(forwardAmount, callData);

        emit SyncL2Requests(_newTotalSyncedPriorityTxs, currentSyncStatus.hash, forwardAmount);
    }

    function syncBatchRoot(uint256 _batchNumber, bytes32 _l2LogsRootHash) external onlyGateway {
        require(_batchNumber > totalBatchesExecuted, "Invalid batch number");
        totalBatchesExecuted = _batchNumber;
        l2LogsRootHashes[_batchNumber] = _l2LogsRootHash;
        emit SyncBatchRoot(_batchNumber, _l2LogsRootHash);
    }

    function syncL2TxHash(bytes32 _l2TxHash, bytes32 _primaryChainL2TxHash) external onlyGateway {
        l2TxHashMap[_l2TxHash] = _primaryChainL2TxHash;
        emit SyncL2TxHash(_l2TxHash, _primaryChainL2TxHash);
    }

    /// @notice Derives the price for L2 gas in ETH to be paid.
    /// @param _l1GasPrice The gas price on L1.
    /// @param _gasPerPubdata The price for each pubdata byte in L2 gas
    /// @return The price of L2 gas in ETH
    function _deriveL2GasPrice(uint256 _l1GasPrice, uint256 _gasPerPubdata) internal view returns (uint256) {
        FeeParams memory _feeParams = feeParams;

        uint256 pubdataPriceETH;
        if (_feeParams.pubdataPricingMode == PubdataPricingMode.Rollup) {
            pubdataPriceETH = L1_GAS_PER_PUBDATA_BYTE * _l1GasPrice;
        }

        uint256 batchOverheadETH = uint256(_feeParams.batchOverheadL1Gas) * _l1GasPrice;
        uint256 fullPubdataPriceETH = pubdataPriceETH + batchOverheadETH / uint256(_feeParams.maxPubdataPerBatch);

        uint256 l2GasPrice = _feeParams.minimalL2GasPrice + batchOverheadETH / uint256(_feeParams.maxL2GasPerBatch);
        uint256 minL2GasPriceETH = (fullPubdataPriceETH + _gasPerPubdata - 1) / _gasPerPubdata;

        return Math.max(l2GasPrice, minL2GasPriceETH);
    }

    /// @dev Convert arbitrary-length message to the raw l2 log
    function _L2MessageToLog(L2Message memory _message) internal pure returns (L2Log memory) {
        return
            L2Log({
            l2ShardId: 0,
            isService: true,
            txNumberInBatch: _message.txNumberInBatch,
            sender: L2_TO_L1_MESSENGER_SYSTEM_CONTRACT_ADDR,
            key: bytes32(uint256(uint160(_message.sender))),
            value: keccak256(_message.data)
        });
    }

    /// @dev Prove that a specific L2 log was sent in a specific L2 batch number
    function _proveL2LogInclusion(
        uint256 _batchNumber,
        uint256 _index,
        L2Log memory _log,
        bytes32[] calldata _proof
    ) internal view returns (bool) {
        require(_batchNumber <= totalBatchesExecuted, "xx");

        bytes32 hashedLog = keccak256(
            abi.encodePacked(_log.l2ShardId, _log.isService, _log.txNumberInBatch, _log.sender, _log.key, _log.value)
        );
        // Check that hashed log is not the default one,
        // otherwise it means that the value is out of range of sent L2 -> L1 logs
        require(hashedLog != L2_L1_LOGS_TREE_DEFAULT_LEAF_HASH, "tw");

        // It is ok to not check length of `_proof` array, as length
        // of leaf preimage (which is `L2_TO_L1_LOG_SERIALIZE_SIZE`) is not
        // equal to the length of other nodes preimages (which are `2 * 32`)

        bytes32 calculatedRootHash = Merkle.calculateRoot(_proof, _index, hashedLog);
        bytes32 actualRootHash = l2LogsRootHashes[_batchNumber];

        return actualRootHash == calculatedRootHash;
    }
}
