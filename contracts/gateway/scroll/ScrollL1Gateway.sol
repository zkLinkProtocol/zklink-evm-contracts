// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IScrollGateway} from "../../interfaces/scroll/IScrollGateway.sol";
import {IScrollMessenger} from "../../interfaces/scroll/IScrollMessenger.sol";
import {IArbitrator} from "../../interfaces/IArbitrator.sol";
import {L1BaseGateway} from "../L1BaseGateway.sol";
import {ScrollGateway} from "./ScrollGateway.sol";

contract ScrollL1Gateway is ScrollGateway, L1BaseGateway {
    function initialize(IArbitrator _arbitrator, IScrollMessenger _messageService) external initializer {
        __L1BaseGateway_init(_arbitrator);
        __ScrollGateway_init(_messageService);
    }

    function sendMessage(uint256 _value, bytes memory _callData, bytes memory _adapterParams)
        external
        payable
        override
        onlyArbitrator
    {
        uint256 _finalizeMessageGasLimit = abi.decode(_adapterParams, (uint256));

        bytes memory executeData = abi.encodeCall(IScrollGateway.claimMessageCallback, (_value, _callData));
        messageService.sendMessage{value: msg.value}(
            remoteGateway, _value, executeData, _finalizeMessageGasLimit, tx.origin
        );
    }

    function claimMessageCallback(uint256 _value, bytes memory _callData)
        external
        payable
        override
        onlyMessageService
    {
        // no fee
        require(msg.value == _value, "Invalid value from canonical message service");

        // Forward message to arbitrator
        arbitrator.receiveMessage{value: msg.value}(_value, _callData);
    }
}
