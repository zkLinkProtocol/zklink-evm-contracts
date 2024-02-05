// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IMailbox} from "../../zksync/l1-contracts/zksync/interfaces/IMailbox.sol";
import {IArbitrator} from "../../interfaces/IArbitrator.sol";
import {L1BaseGateway} from "../L1BaseGateway.sol";
import {IZkSyncL1Gateway} from "../../interfaces/zksync/IZkSyncL1Gateway.sol";
import {IZkSyncL2Gateway} from "../../interfaces/zksync/IZkSyncL2Gateway.sol";
import {BaseGateway} from "../BaseGateway.sol";
import {L2Message} from "../../zksync/l1-contracts/zksync/Storage.sol";

contract ZkSyncL1Gateway is IZkSyncL1Gateway, L1BaseGateway, BaseGateway {
    /// @notice ZkSync message service on local chain
    IMailbox public immutable messageService;

    /// @dev A mapping L2 batch number => message number => flag
    /// @dev Used to indicate that zkSync L2 -> L1 message was already processed
    mapping(uint256 => mapping(uint256 => bool)) public isMessageFinalized;

    constructor(IArbitrator _arbitrator, IMailbox _messageService) L1BaseGateway(_arbitrator) {
        messageService = _messageService;
    }

    /// @dev Receive eth from zkSync canonical bridge
    receive() external payable {}

    function initialize() external initializer {
        __BaseGateway_init();
    }

    function sendMessage(
        uint256 _value,
        bytes memory _callData,
        bytes memory _adapterParams
    ) external payable onlyArbitrator {
        (uint256 _l2GasLimit, uint256 _l2GasPerPubdataByteLimit) = abi.decode(_adapterParams, (uint256, uint256));
        bytes memory executeData = abi.encodeCall(IZkSyncL2Gateway.claimMessage, (_value, _callData));
        messageService.requestL2Transaction{value: msg.value}(
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
        bytes memory _message,
        bytes32[] calldata _merkleProof
    ) external nonReentrant {
        require(!isMessageFinalized[_l2BatchNumber][_l2MessageIndex], "Message was finalized");

        L2Message memory l2ToL1Message = L2Message({
            txNumberInBatch: _l2TxNumberInBatch,
            sender: remoteGateway,
            data: _message
        });

        bool success = messageService.proveL2MessageInclusion(
            _l2BatchNumber,
            _l2MessageIndex,
            l2ToL1Message,
            _merkleProof
        );
        require(success, "Invalid message");

        // Update message status
        isMessageFinalized[_l2BatchNumber][_l2MessageIndex] = true;

        // Forward message to arbitrator
        (uint256 value, bytes memory callData) = abi.decode(_message, (uint256, bytes));
        arbitrator.receiveMessage{value: value}(value, callData);
    }
}
