// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IArbitrator} from "../../interfaces/IArbitrator.sol";
import {IOptimismMessenger} from "../../interfaces/optimism/IOptimismMessenger.sol";
import {IOptimismGateway} from "../../interfaces/optimism/IOptimismGateway.sol";
import {OptimismGateway} from "./OptimismGateway.sol";
import {L1BaseGateway} from "../L1BaseGateway.sol";

contract OptimismL1Gateway is L1BaseGateway, OptimismGateway {
    constructor(
        IArbitrator _arbitrator,
        IOptimismMessenger _messageService
    ) L1BaseGateway(_arbitrator) OptimismGateway(_messageService) {
        _disableInitializers();
    }

    function initialize() external initializer {
        __OptimismGateway_init();
    }

    function sendMessage(
        uint256 _value,
        bytes memory _callData,
        bytes memory _adapterParams
    ) external payable onlyArbitrator {
        require(msg.value == _value, "Invalid value");
        uint32 _minGasLimit = abi.decode(_adapterParams, (uint32));
        bytes memory message = abi.encodeCall(IOptimismGateway.claimMessageCallback, (_value, _callData));
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
