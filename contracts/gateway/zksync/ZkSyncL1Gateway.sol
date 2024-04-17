// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IMailbox, TxStatus} from "../../zksync/l1-contracts/zksync/interfaces/IMailbox.sol";
import {IGetters} from "../../zksync/l1-contracts/zksync/interfaces/IGetters.sol";
import {IArbitrator} from "../../interfaces/IArbitrator.sol";
import {L1BaseGateway} from "../L1BaseGateway.sol";
import {IZkSyncL1Gateway} from "../../interfaces/zksync/IZkSyncL1Gateway.sol";
import {IMessageClaimer} from "../../interfaces/IMessageClaimer.sol";
import {BaseGateway} from "../BaseGateway.sol";
import {L2Message} from "../../zksync/l1-contracts/zksync/Storage.sol";
import {UnsafeBytes} from "../../zksync/l1-contracts/common/libraries/UnsafeBytes.sol";
import {L2_ETH_TOKEN_SYSTEM_CONTRACT_ADDR} from "../../zksync/l1-contracts/common/L2ContractAddresses.sol";

contract ZkSyncL1Gateway is IZkSyncL1Gateway, L1BaseGateway, BaseGateway {
    /// @dev The L2 eth withdraw message minimum length
    uint256 private constant L2_ETH_WITHDRAW_MESSAGE_MINIMUM_LENGTH = 108;

    /// @notice ZkSync message service on local chain
    IMailbox public immutable MESSAGE_SERVICE;

    /// @dev A mapping L2 batch number => message number => flag
    /// @dev Used to indicate that zkSync L2 -> L1 message was already processed
    mapping(uint256 => mapping(uint256 => bool)) public isMessageFinalized;
    /// @dev A mapping of executed message
    mapping(bytes32 l2TxHash => bytes32 messageHash) public executedMessage;

    /// @dev Emit when retry failed message
    event RetryFailedMessage(bytes32 failedL2TxHash, bytes32 replacedL2TxHash);

    /// @notice Checks if relayer is active
    modifier onlyRelayer() {
        require(ARBITRATOR.isRelayerActive(msg.sender), "Not relayer"); // relayer is not active
        _;
    }

    constructor(IArbitrator _arbitrator, IMailbox _messageService) L1BaseGateway(_arbitrator) {
        _disableInitializers();
        MESSAGE_SERVICE = _messageService;
    }

    /// @dev Receive eth from zkSync canonical bridge
    receive() external payable {
        // nothing to do here
    }

    function initialize() external initializer {
        __BaseGateway_init();
    }

    function sendMessage(
        uint256 _value,
        bytes calldata _callData,
        bytes calldata _adapterParams
    ) external payable onlyArbitrator {
        (uint256 _l2GasLimit, uint256 _l2GasPerPubdataByteLimit) = abi.decode(_adapterParams, (uint256, uint256));
        bytes memory executeData = abi.encodeCall(IMessageClaimer.claimMessageCallback, (_value, _callData));
        bytes32 messageHash = keccak256(executeData);
        // If the l2 transaction fails to execute, for example l2GasLimit is too small
        // The l2 value will be refunded to the l2 gateway address.
        // Then the relayer can retry failed tx from L1
        bytes32 l2TxHash = MESSAGE_SERVICE.requestL2Transaction{value: msg.value}(
            remoteGateway,
            _value,
            executeData,
            _l2GasLimit,
            _l2GasPerPubdataByteLimit,
            new bytes[](0),
            remoteGateway
        );
        executedMessage[l2TxHash] = messageHash;
    }

    function finalizeMessage(
        uint256 _l2BatchNumber,
        uint256 _l2MessageIndex,
        uint16 _l2TxNumberInBatch,
        bytes calldata _message,
        bytes32[] calldata _merkleProof
    ) external nonReentrant {
        require(!isMessageFinalized[_l2BatchNumber][_l2MessageIndex], "Message was finalized");

        (uint256 value, bytes memory callData) = _parseL2EthWithdrawalMessage(_message);

        // Check if the withdrawal has already been finalized on L2.
        bool alreadyFinalised = IGetters(address(MESSAGE_SERVICE)).isEthWithdrawalFinalized(
            _l2BatchNumber,
            _l2MessageIndex
        );
        if (alreadyFinalised) {
            // Check that the specified message was actually sent while withdrawing eth from L2.
            L2Message memory l2ToL1Message = L2Message({
                txNumberInBatch: _l2TxNumberInBatch,
                sender: L2_ETH_TOKEN_SYSTEM_CONTRACT_ADDR,
                data: _message
            });
            bool success = MESSAGE_SERVICE.proveL2MessageInclusion(
                _l2BatchNumber,
                _l2MessageIndex,
                l2ToL1Message,
                _merkleProof
            );
            require(success, "Invalid message");
        } else {
            // Finalize the withdrawal if it is not yet done.
            MESSAGE_SERVICE.finalizeEthWithdrawal(
                _l2BatchNumber,
                _l2MessageIndex,
                _l2TxNumberInBatch,
                _message,
                _merkleProof
            );
        }

        // Update message status
        isMessageFinalized[_l2BatchNumber][_l2MessageIndex] = true;

        // Forward message to arbitrator
        ARBITRATOR.receiveMessage{value: value}(value, callData);
    }

    /// @dev Retry a message that executed failed on L2
    /// @param _executeData The message data
    /// @param _l2GasLimit Maximum amount of L2 gas that transaction can consume during execution on L2
    /// @param _l2GasPerPubdataByteLimit The maximum amount L2 gas that the operator may charge the user for single byte of pubdata.
    /// @param _refundRecipient The address on L2 that will receive the refund for the transaction.
    /// @param _failedL2TxHash The L2 transaction hash of the failed finalization
    /// @param _l2BatchNumber The L2 batch number where the finalization was processed
    /// @param _l2MessageIndex The position in the L2 logs Merkle tree of the l2Log that was sent with the message
    /// @param _l2TxNumberInBatch The L2 transaction number in a batch, in which the log was sent
    /// @param _merkleProof The Merkle proof of the processing L1 -> L2 transaction with deposit finalization
    function retryFailedMessage(
        bytes calldata _executeData,
        uint256 _l2GasLimit,
        uint256 _l2GasPerPubdataByteLimit,
        address _refundRecipient,
        bytes32 _failedL2TxHash,
        uint256 _l2BatchNumber,
        uint256 _l2MessageIndex,
        uint16 _l2TxNumberInBatch,
        bytes32[] calldata _merkleProof
    ) external payable nonReentrant onlyRelayer {
        bool proofValid = MESSAGE_SERVICE.proveL1ToL2TransactionStatus(
            _failedL2TxHash,
            _l2BatchNumber,
            _l2MessageIndex,
            _l2TxNumberInBatch,
            _merkleProof,
            TxStatus.Failure
        );
        require(proofValid, "Invalid proof");

        bytes32 messageHash = keccak256(_executeData);
        require(executedMessage[_failedL2TxHash] == messageHash, "Invalid message");

        delete executedMessage[_failedL2TxHash];

        // Retry the message without l2 value
        // Excess fee will be refunded to the `_refundRecipient`
        bytes32 replacedL2TxHash = MESSAGE_SERVICE.requestL2Transaction{value: msg.value}(
            remoteGateway,
            0,
            _executeData,
            _l2GasLimit,
            _l2GasPerPubdataByteLimit,
            new bytes[](0),
            _refundRecipient
        );
        executedMessage[replacedL2TxHash] = messageHash;
        emit RetryFailedMessage(_failedL2TxHash, replacedL2TxHash);
    }

    /// @dev Decode the ETH withdraw message with additional data about sendMessage that came from ZkSyncL2Gateway
    function _parseL2EthWithdrawalMessage(
        bytes memory _message
    ) internal view returns (uint256 l2Value, bytes memory l2CallData) {
        // Check that the message length is correct.
        // additionalData (sendMessage): l2Value + l2CallData >= 32 (bytes)
        // It should be equal to the length of the function signature + eth receiver address + uint256 amount + l2Sender
        // + additionalData >= 4 + 20 + 32 + 20 + 32 = 108 (bytes).
        require(_message.length >= L2_ETH_WITHDRAW_MESSAGE_MINIMUM_LENGTH, "Incorrect message length");

        (uint32 functionSignature, uint256 offset) = UnsafeBytes.readUint32(_message, 0);
        require(bytes4(functionSignature) == IMailbox.finalizeEthWithdrawal.selector, "Incorrect function selector");

        address l1EthReceiver;
        (l1EthReceiver, offset) = UnsafeBytes.readAddress(_message, offset);
        require(l1EthReceiver == address(this), "Wrong L1 ETH withdraw receiver");

        uint256 ethAmount;
        (ethAmount, offset) = UnsafeBytes.readUint256(_message, offset);

        address l2Sender;
        (l2Sender, offset) = UnsafeBytes.readAddress(_message, offset);
        require(l2Sender == remoteGateway, "Not initiated by L2 gateway");

        // Parse additional data
        (l2Value, offset) = UnsafeBytes.readUint256(_message, offset);
        require(l2Value == ethAmount, "Invalid l2 value");

        uint256 l2CallDataLength = _message.length - offset;
        l2CallData = UnsafeBytes.slice(_message, offset, l2CallDataLength);
    }
}
