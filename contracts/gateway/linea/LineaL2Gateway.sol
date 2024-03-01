// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IL2MessageService} from "../../interfaces/linea/IL2MessageService.sol";
import {IMessageClaimer} from "../../interfaces/IMessageClaimer.sol";
import {LineaGateway} from "./LineaGateway.sol";
import {L2BaseGateway} from "../L2BaseGateway.sol";

contract LineaL2Gateway is L2BaseGateway, LineaGateway {
    constructor(
        address _zkLink,
        IL2MessageService _messageService
    ) L2BaseGateway(_zkLink) LineaGateway(_messageService) {
        _disableInitializers();
    }

    function initialize() external initializer {
        __LineaGateway_init();
    }

    function sendMessage(uint256 _value, bytes memory _callData) external payable override onlyZkLink {
        // msg value should include fee
        uint256 coinbaseFee = IL2MessageService(address(MESSAGE_SERVICE)).minimumFeeInWei();
        require(msg.value == _value + coinbaseFee, "Invalid value");

        bytes memory message = abi.encodeCall(IMessageClaimer.claimMessageCallback, (_value, _callData));
        MESSAGE_SERVICE.sendMessage{value: msg.value}(remoteGateway, coinbaseFee, message);
        emit L2GatewayMessageSent(_value, _callData);
    }

    function claimMessageCallback(
        uint256 _value,
        bytes calldata _callData
    ) external payable onlyMessageService onlyRemoteGateway {
        require(msg.value == _value, "Invalid value");

        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = ZKLINK.call{value: _value}(_callData);
        require(success, "Call zkLink failed");
    }
}
