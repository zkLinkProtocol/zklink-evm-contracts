// SPDX-License-Identifier: MIT OR Apache-2.0

pragma solidity ^0.8.0;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {AddressAliasHelper} from "./AddressAliasHelper.sol";
import {IZkLink} from "./interfaces/IZkLink.sol";
import {IL2Gateway} from "./interfaces/IL2Gateway.sol";
import {IMailbox} from "./interfaces/IMailbox.sol";

/// @title ZkLink contract
/// @author zk.link
contract ZkLink is IZkLink, OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    /// @notice The struct that describes whether users will be charged for pubdata for L1->L2 transactions.
    /// @param Rollup The users are charged for pubdata & it is priced based on the gas price on Ethereum.
    /// @param Validium The pubdata is considered free with regard to the L1 gas price.
    enum PubdataPricingMode {
        Rollup,
        Validium
    }

    /// @notice The fee params for L1->L2 transactions for the network.
    /// @param pubdataPricingMode How the users will charged for pubdata in L1->L2 transactions.
    /// @param batchOverheadL1Gas The amount of L1 gas required to process the batch (except for the calldata).
    /// @param maxPubdataPerBatch The maximal number of pubdata that can be emitted per batch.
    /// @param priorityTxMaxPubdata The maximal amount of pubdata a priority transaction is allowed to publish.
    /// It can be slightly less than maxPubdataPerBatch in order to have some margin for the bootloader execution.
    /// @param minimalL2GasPrice The minimal L2 gas price to be used by L1->L2 transactions. It should represent
    /// the price that a single unit of compute costs.`
    struct FeeParams {
        PubdataPricingMode pubdataPricingMode;
        uint32 batchOverheadL1Gas;
        uint32 maxPubdataPerBatch;
        uint32 maxL2GasPerBatch;
        uint32 priorityTxMaxPubdata;
        uint64 minimalL2GasPrice;
    }

    /// @dev Internal structure that contains the parameters for the forwardRequestL2Transaction
    /// @param sender The sender's address.
    /// @param txId The id of the priority transaction.
    /// @param contractAddressL2 The address of the contract on L2 to call.
    /// @param l2Value The msg.value of the L2 transaction.
    /// @param l2CallData The call data of the L2 transaction.
    /// @param l2GasLimit The limit of the L2 gas for the L2 transaction
    /// @param l2GasPrice The price of the L2 gas in Wei to be used for this transaction.
    /// @param l2GasPricePerPubdata The price for a single pubdata byte in L2 gas.
    /// @param refundRecipient The recipient of the refund for the transaction on L2. If the transaction fails, then
    /// this address will receive the `l2Value`.
    struct ForwardL2Request {
        address sender;
        uint256 txId;
        address contractAddressL2;
        uint256 l2Value;
        bytes l2CallData;
        uint256 l2GasLimit;
        uint256 l2GasPricePerPubdata;
        bytes[] factoryDeps;
        address refundRecipient;
    }

    /// @dev The sync status for priority op
    /// @param hash The cumulative canonicalTxHash
    /// @param amount The cumulative l2 value
    struct SyncStatus {
        bytes32 hash;
        uint256 amount;
    }

    /// @dev The L2 gasPricePerPubdata required to be used in bridges.
    uint256 public constant REQUIRED_L2_GAS_PRICE_PER_PUBDATA = 800;
    /// @dev The number of pubdata an L1->L2 transaction requires with each new factory dependency
    uint256 public constant MAX_NEW_FACTORY_DEPS = 32;
    /// @dev Even though the price for 1 byte of pubdata is 16 L1 gas, we have a slightly increased value.
    uint256 public constant L1_GAS_PER_PUBDATA_BYTE = 17;

    /// @notice The gateway is used for communicating with L1
    IL2Gateway public gateway;
    /// @notice List of permitted validators
    mapping(address validatorAddress => bool isValidator) public validators;
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
    mapping(uint256 priorityOpId => SyncStatus) public priorityOpSyncStatus;
    /// @dev Stored root hashes of L2 -> L1 logs
    mapping(uint256 batchNumber => bytes32 l2LogsRootHash) public l2LogsRootHashes;

    event NewPriorityRequest(uint256 indexed priorityOpId, ForwardL2Request l2Request);
    event SyncL2Requests(uint256 indexed totalSyncedPriorityTxs, bytes32 indexed syncHash, uint256 indexed forwardEthAmount);

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
        if (sender != tx.origin) {
            sender = AddressAliasHelper.applyL1ToL2Alias(msg.sender);
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
        SyncStatus memory syncStatus;
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

    function syncL2Requests(uint256 _newTotalSyncedPriorityTxs) external payable onlyValidator {
        // Check newTotalSyncedPriorityTxs
        require(_newTotalSyncedPriorityTxs <= totalPriorityTxs && _newTotalSyncedPriorityTxs > totalSyncedPriorityTxs, "Invalid newTotalSyncedPriorityTxs");

        // Forward eth amount is the difference of two accumulate amount
        SyncStatus memory lastSyncStatus;
        if (totalSyncedPriorityTxs > 0) {
            lastSyncStatus = priorityOpSyncStatus[totalSyncedPriorityTxs - 1];
        }
        SyncStatus memory currentSyncStatus = priorityOpSyncStatus[_newTotalSyncedPriorityTxs - 1];
        uint256 forwardAmount = currentSyncStatus.amount - lastSyncStatus.amount;

        // Update synced priority txs
        totalSyncedPriorityTxs = _newTotalSyncedPriorityTxs;

        // Send sync status to L1 gateway
        bytes memory callData = abi.encodeCall(IMailbox.syncL2Requests, (_newTotalSyncedPriorityTxs, currentSyncStatus.hash, forwardAmount));
        gateway.sendMessage{value: msg.value + forwardAmount}(forwardAmount, callData);

        emit SyncL2Requests(_newTotalSyncedPriorityTxs, currentSyncStatus.hash, forwardAmount);
    }

    function syncBatchRoot(uint256 _batchNumber, bytes32 _l2LogsRootHash) external {
        l2LogsRootHashes[_batchNumber] = _l2LogsRootHash;
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
}
