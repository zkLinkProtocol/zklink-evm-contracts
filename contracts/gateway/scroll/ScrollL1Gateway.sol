// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IScrollGateway} from "../../interfaces/scroll/IScrollGateway.sol";
import {IScrollMessenger} from "../../interfaces/scroll/IScrollMessenger.sol";
import {IL1MessageQueue} from "../../interfaces/scroll/IL1MessageQueue.sol";
import {IArbitrator} from "../../interfaces/IArbitrator.sol";
import {L1BaseGateway} from "../L1BaseGateway.sol";
import {BaseGateway} from "../BaseGateway.sol";

contract ScrollL1Gateway is IScrollGateway, L1BaseGateway, BaseGateway {
    /// @notice Scroll message service on local chain
    IScrollMessenger public messageService;
    /// @notice Scroll message queue on local chain
    IL1MessageQueue public messageQueue;

    function initialize(IArbitrator _arbitrator, IScrollMessenger _messageService, IL1MessageQueue _messageQueue)
        external
        initializer
    {
        __L1BaseGateway_init(_arbitrator);
        __BaseGateway_init();

        messageService = _messageService;
        messageQueue = _messageQueue;
    }

    function sendMessage(uint256 _value, bytes memory _calldata, bytes memory _adapterParams)
        external
        payable
        override
        onlyArbitrator
    {
        uint256 _finalizeMessageGasLimit = abi.decode(_adapterParams, (uint256));
        // estimate fee
        uint256 _fee = IL1MessageQueue(messageQueue).estimateCrossDomainMessageFee(_finalizeMessageGasLimit);
        // ensure enough eth value
        require(msg.value == _value + _fee, "Invalid value");

        bytes memory executeData = abi.encodeCall(IScrollGateway.finalizeMessage, (_value, _calldata));
        messageService.sendMessage{value: msg.value}(
            remoteGateway, _value, executeData, _finalizeMessageGasLimit, tx.origin
        );
    }

    function finalizeMessage(uint256 _value, bytes memory _callData) external payable override nonReentrant {
        // no fee
        require(msg.value == _value, "Invalid value from canonical message service");

        // Forward message to arbitrator
        arbitrator.receiveMessage{value: msg.value}(_value, _callData);
    }
}
