// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IMessageService} from "../../interfaces/linea/IMessageService.sol";
import {ILineaGateway} from "../../interfaces/linea/ILineaGateway.sol";
import {LineaGateway} from "./LineaGateway.sol";
import {L2BaseGateway} from "../L2BaseGateway.sol";

contract LineaL2Gateway is L2BaseGateway, LineaGateway {
    constructor(address _zkLink, IMessageService _messageService) L2BaseGateway(_zkLink) LineaGateway(_messageService) {
        _disableInitializers();
    }

    function initialize() external initializer {
        __LineaGateway_init();
    }

    function sendMessage(uint256 value, bytes memory callData) external payable override onlyZkLink {
        // transfer no fee to destination chain
        require(msg.value == value, "Invalid value");

        bytes memory message = abi.encodeCall(ILineaGateway.claimMessageCallback, (value, callData));
        MESSAGE_SERVICE.sendMessage{value: msg.value}(remoteGateway, 0, message);
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
