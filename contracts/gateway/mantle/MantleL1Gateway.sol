// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IArbitrator} from "../../interfaces/IArbitrator.sol";
import {IMantleMessenger} from "../../interfaces/mantle/IMantleMessenger.sol";
import {IMessageClaimer} from "../../interfaces/IMessageClaimer.sol";
import {MantleGateway} from "./MantleGateway.sol";
import {L1BaseGateway} from "../L1BaseGateway.sol";

contract MantleL1Gateway is L1BaseGateway, MantleGateway {
    constructor(
        IArbitrator _arbitrator,
        IMantleMessenger _messageService
    ) L1BaseGateway(_arbitrator) MantleGateway(_messageService) {
        _disableInitializers();
    }

    function initialize() external initializer {
        __MantleGateway_init();
    }

    function sendMessage(
        uint256 _value,
        bytes calldata _callData,
        bytes calldata _adapterParams
    ) external payable onlyArbitrator {
        require(msg.value == _value, "Invalid value");
        uint32 _minGasLimit = abi.decode(_adapterParams, (uint32));
        bytes memory message = abi.encodeCall(IMessageClaimer.claimMessageCallback, (_value, _callData));
        // `_otherSideNativeTokenAmount` must be 0. Sending mnt with messages is not supported.
        MESSAGE_SERVICE.sendMessage{value: _value}(0, remoteGateway, message, _minGasLimit);
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
