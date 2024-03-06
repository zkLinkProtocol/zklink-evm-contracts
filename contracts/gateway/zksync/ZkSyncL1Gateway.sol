// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IMailbox} from "../../zksync/l1-contracts/zksync/interfaces/IMailbox.sol";
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
    /// @notice ZkSync message service on local chain
    IMailbox public immutable MESSAGE_SERVICE;

    /// @dev A mapping L2 batch number => message number => flag
    /// @dev Used to indicate that zkSync L2 -> L1 message was already processed
    mapping(uint256 => mapping(uint256 => bool)) public isMessageFinalized;

    constructor(IArbitrator _arbitrator, IMailbox _messageService) L1BaseGateway(_arbitrator) {
        _disableInitializers();
        MESSAGE_SERVICE = _messageService;
    }

    /// @dev Receive eth from zkSync canonical bridge
    receive() external payable {}

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
        // no use of the return value
        MESSAGE_SERVICE.requestL2Transaction{value: msg.value}(
            remoteGateway,
            _value,
            executeData,
            _l2GasLimit,
            _l2GasPerPubdataByteLimit,
            new bytes[](0),
            // solhint-disable-next-line avoid-tx-origin
            tx.origin
        );
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

    /// @dev Decode the ETH withdraw message with additional data about sendMessage that came from ZkSyncL2Gateway
    function _parseL2EthWithdrawalMessage(
        bytes memory _message
    ) internal view returns (uint256 l2Value, bytes memory l2CallData) {
        // Check that the message length is correct.
        // additionalData (sendMessage): l2Value + l2CallData >= 32 (bytes)
        // It should be equal to the length of the function signature + eth receiver address + uint256 amount + l2Sender
        // + additionalData >= 4 + 20 + 32 + 20 + 32 = 108 (bytes).
        require(_message.length >= 108, "Incorrect message length");

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
