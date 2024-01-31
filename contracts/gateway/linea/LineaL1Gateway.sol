// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {DoubleEndedQueueUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/structs/DoubleEndedQueueUpgradeable.sol";
import {IArbitrator} from "../../interfaces/IArbitrator.sol";
import {IMessageService} from "../../interfaces/linea/IMessageService.sol";
import {LineaGateway} from "./LineaGateway.sol";
import {L1BaseGateway} from "../L1BaseGateway.sol";

contract LineaL1Gateway is L1BaseGateway, LineaGateway {
    using DoubleEndedQueueUpgradeable for DoubleEndedQueueUpgradeable.Bytes32Deque;

    function initialize(IArbitrator _arbitrator, IMessageService _messageService) external initializer {
        __L1BaseGateway_init(_arbitrator);
        __LineaGateway_init(_messageService);
    }

    function finalizeMessage(uint256 _value, bytes calldata _callData) external payable {
        bytes32 finalizeMessageHash = keccak256(abi.encode(_value, _callData));
        require(finalizeMessageHash == messageHashQueue.popFront(), "Invalid finalize message hash");

        // Forward message to arbitrator
        arbitrator.forwardMessage{value: msg.value}(_value, _callData);
    }

    function sendMessage(uint256 _value, bytes memory _callData) external payable override onlyArbitrator {
        // no fee
        require(msg.value == _value, "Invalid value");

        // transfer no fee to Linea
        bytes memory message = abi.encodeCall(LineaGateway.claimMessageCallback, (_value, _callData));
        messageService.sendMessage{value: _value}(remoteGateway, 0, message);
    }
}
