// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IMessageClaimer} from "../../interfaces/IMessageClaimer.sol";
import {IScrollMessenger} from "../../interfaces/scroll/IScrollMessenger.sol";
import {L2BaseGateway} from "../L2BaseGateway.sol";
import {ScrollGateway} from "./ScrollGateway.sol";

contract ScrollL2Gateway is L2BaseGateway, ScrollGateway {
    constructor(
        address _zkLink,
        IScrollMessenger _messageService
    ) L2BaseGateway(_zkLink) ScrollGateway(_messageService) {
        _disableInitializers();
    }

    function initialize() external initializer {
        __ScrollGateway_init();
    }

    function sendMessage(uint256 _value, bytes calldata _callData) external payable override onlyZkLink {
        // no fee
        require(msg.value == _value, "Invalid value");

        bytes memory callData = abi.encodeCall(IMessageClaimer.claimMessageCallback, (_value, _callData));
        // transfer no fee to L1
        MESSAGE_SERVICE.sendMessage{value: _value}(
            remoteGateway,
            _value,
            callData,
            0 // Gas limit required to complete the deposit on L1. This is optional, send 0 if you don’t want to set it.
        );
        emit L2GatewayMessageSent(_value, _callData);
    }

    function claimMessageCallback(
        uint256 _value,
        bytes calldata _callData
    ) external payable override onlyMessageService onlyRemoteGateway {
        require(msg.value == _value, "Invalid value");

        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = ZKLINK.call{value: _value}(_callData);
        require(success, "Call zkLink failed");
    }
}
