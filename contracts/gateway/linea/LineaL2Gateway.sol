// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {DoubleEndedQueueUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/structs/DoubleEndedQueueUpgradeable.sol";
import {IMessageService} from "../../interfaces/linea/IMessageService.sol";
import {IZkLink} from "../../interfaces/IZkLink.sol";
import {LineaGateway} from "./LineaGateway.sol";
import {L2BaseGateway} from "../L2BaseGateway.sol";

contract LineaL2Gateway is L2BaseGateway, LineaGateway {
    using DoubleEndedQueueUpgradeable for DoubleEndedQueueUpgradeable.Bytes32Deque;

    function initialize(IZkLink _zkLink, IMessageService _messageService) external initializer {
        __L2BaseGateway_init(_zkLink);
        __LineaGateway_init(_messageService);
    }

    function sendMessage(uint256 value, bytes memory callData) external payable override onlyZkLink {
        // msg value should include fee
        uint256 coinbaseFee = messageService.minimumFeeInWei();
        require(msg.value == value + coinbaseFee, "Invalid fee");

        bytes memory message = abi.encodeCall(LineaGateway.claimMessageCallback, (value, callData));
        messageService.sendMessage{value: msg.value}(address(remoteGateway), coinbaseFee, message);
    }

    function finalizeMessage(uint256 _value, bytes calldata _callData) external payable {
        bytes32 finalizeMessageHash = keccak256(abi.encode(_value, _callData));
        require(finalizeMessageHash == messageHashQueue.popFront(), "Invalid finalize message hash");

        // no fee
        require(msg.value == _value, "Claim eth value not match");

        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = address(zkLink).call{value: _value}(_callData);
        require(success, "Call zkLink failed");
    }
}
