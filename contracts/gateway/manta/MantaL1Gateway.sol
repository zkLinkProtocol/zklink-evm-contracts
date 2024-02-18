// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IArbitrator} from "../../interfaces/IArbitrator.sol";
import {IMantaMessenger} from "../../interfaces/manta/IMantaMessenger.sol";
import {IMantaGateway} from "../../interfaces/manta/IMantaGateway.sol";
import {MantaGateway} from "./MantaGateway.sol";
import {L1BaseGateway} from "../L1BaseGateway.sol";

contract MantaL1Gateway is L1BaseGateway, MantaGateway {
    constructor(
        IArbitrator _arbitrator,
        IMantaMessenger _messageService
    ) L1BaseGateway(_arbitrator) MantaGateway(_messageService) {
        _disableInitializers();
    }

    function initialize() external initializer {
        __MantaGateway_init();
    }

    function sendMessage(
        uint256 _value,
        bytes memory _callData,
        bytes memory _adapterParams
    ) external payable onlyArbitrator {
        require(msg.value == _value, "Invalid value");
        uint32 _minGasLimit = abi.decode(_adapterParams, (uint32));
        bytes memory message = abi.encodeCall(IMantaGateway.claimMessageCallback, (_value, _callData));
        MESSAGE_SERVICE.sendMessage{value: _value}(remoteGateway, message, _minGasLimit);
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
