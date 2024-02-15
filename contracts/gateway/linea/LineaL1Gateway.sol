// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IArbitrator} from "../../interfaces/IArbitrator.sol";
import {IMessageService} from "../../interfaces/linea/IMessageService.sol";
import {ILineaGateway} from "../../interfaces/linea/ILineaGateway.sol";
import {LineaGateway} from "./LineaGateway.sol";
import {L1BaseGateway} from "../L1BaseGateway.sol";

contract LineaL1Gateway is L1BaseGateway, LineaGateway {
    constructor(
        IArbitrator _arbitrator,
        IMessageService _messageService
    ) L1BaseGateway(_arbitrator) LineaGateway(_messageService) {
        _disableInitializers();
    }

    function initialize() external initializer {
        __LineaGateway_init();
    }

    function sendMessage(uint256 _value, bytes memory _callData, bytes memory) external payable onlyArbitrator {
        // transfer no fee to Linea
        bytes memory message = abi.encodeCall(ILineaGateway.claimMessageCallback, (_value, _callData));
        MESSAGE_SERVICE.sendMessage{value: _value}(remoteGateway, 0, message);
    }

    function claimMessageCallback(
        uint256 _value,
        bytes calldata _callData
    ) external payable onlyMessageService onlyRemoteGateway {
        require(msg.value == _value, "Invalid value");
        // Forward message to arbitrator
        ARBITRATOR.receiveMessage{value: _value}(_value, _callData);
    }
}
