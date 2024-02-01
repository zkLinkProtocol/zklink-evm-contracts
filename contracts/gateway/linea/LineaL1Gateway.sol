// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IArbitrator} from "../../interfaces/IArbitrator.sol";
import {IMessageService} from "../../interfaces/linea/IMessageService.sol";
import {ILineaGateway} from "../../interfaces/linea/ILineaGateway.sol";
import {LineaGateway} from "./LineaGateway.sol";
import {L1BaseGateway} from "../L1BaseGateway.sol";

contract LineaL1Gateway is L1BaseGateway, LineaGateway {

    function initialize(IArbitrator _arbitrator, IMessageService _messageService) external initializer {
        __L1BaseGateway_init(_arbitrator);
        __LineaGateway_init(_messageService);
    }

    function sendMessage(uint256 _value, bytes memory _callData, bytes memory) external payable onlyArbitrator {
        // transfer no fee to Linea
        bytes memory message = abi.encodeCall(ILineaGateway.claimMessageCallback, (_value, _callData));
        messageService.sendMessage{value: _value}(remoteGateway, 0, message);
    }

    function claimMessageCallback(uint256 _value, bytes calldata _callData) external payable onlyMessageService onlyRemoteGateway {
        require(msg.value == _value, "Invalid value from canonical message service");
        // Forward message to arbitrator
        arbitrator.receiveMessage{value: _value}(_value, _callData);
    }
}
