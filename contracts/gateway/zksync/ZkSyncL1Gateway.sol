// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IZkSync} from "../../interfaces/zksync/IZkSync.sol";
import {IArbitrator} from "../../interfaces/IArbitrator.sol";
import {L1BaseGateway} from "../L1BaseGateway.sol";
import {IZkSyncL1Gateway} from "../../interfaces/zksync/IZkSyncL1Gateway.sol";
import {IZkSyncL2Gateway} from "../../interfaces/zksync/IZkSyncL2Gateway.sol";
import {BaseGateway} from "../BaseGateway.sol";

contract ZkSyncL1Gateway is IZkSyncL1Gateway, L1BaseGateway, BaseGateway {
    /// @notice ZkSync message service on local chain
    IZkSync public messageService;

    /// @dev A mapping L2 batch number => message number => flag
    /// @dev Used to indicate that zkSync L2 -> L1 message was already processed
    mapping(uint256 => mapping(uint256 => bool)) public isMessageFinalized;

    /// @dev Receive eth from zkSync canonical bridge
    receive() external payable {
    }

    function initialize(IArbitrator _arbitrator, IZkSync _messageService) external initializer {
        __L1BaseGateway_init(_arbitrator);
        __BaseGateway_init();

        messageService = _messageService;
    }

    function sendMessage(uint256 _value, bytes memory _callData, bytes memory _adapterParams) external payable onlyArbitrator {
        // ensure msg value include claim fee
        (uint256 _l2GasLimit, uint256 _l2GasPerPubdataByteLimit) = abi.decode(_adapterParams, (uint256, uint256));
        uint256 claimFee = messageService.l2TransactionBaseCost(tx.gasprice, _l2GasLimit, _l2GasPerPubdataByteLimit);
        require(msg.value == claimFee + _value, "Invalid value");

        bytes memory executeData = abi.encodeCall(IZkSyncL2Gateway.claimMessage, (_value, _callData));
        messageService.requestL2Transaction{value: msg.value}(remoteGateway, _value, executeData, claimFee, _l2GasPerPubdataByteLimit, new bytes[](0), tx.origin);
    }

    function finalizeMessage(uint256 _l2BatchNumber, uint256 _l2MessageIndex, uint16 _l2TxNumberInBatch, bytes memory _message, bytes32[] calldata _merkleProof) external nonReentrant {
        require(!isMessageFinalized[_l2BatchNumber][_l2MessageIndex], "Message was finalized");

        IZkSync.L2Message memory l2ToL1Message = IZkSync.L2Message({
            txNumberInBatch: _l2TxNumberInBatch,
            sender: remoteGateway,
            data: _message
        });

        bool success = messageService.proveL2MessageInclusion(_l2BatchNumber, _l2MessageIndex, l2ToL1Message, _merkleProof);
        require(success, "Invalid message");

        // Update message status
        isMessageFinalized[_l2BatchNumber][_l2MessageIndex] = true;

        // Read function signature
        (bytes4 functionSignature, uint256 value, bytes memory callData) = abi.decode(_message, (bytes4, uint256, bytes));
        require(functionSignature == this.finalizeMessage.selector, "Invalid function selector");

        // Forward message to arbitrator
        arbitrator.receiveMessage{value: value}(value, callData);
    }
}
