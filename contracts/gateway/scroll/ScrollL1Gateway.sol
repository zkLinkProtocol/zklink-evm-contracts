// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IMessageClaimer} from "../../interfaces/IMessageClaimer.sol";
import {IScrollMessenger} from "../../interfaces/scroll/IScrollMessenger.sol";
import {IArbitrator} from "../../interfaces/IArbitrator.sol";
import {L1BaseGateway} from "../L1BaseGateway.sol";
import {ScrollGateway} from "./ScrollGateway.sol";

contract ScrollL1Gateway is ScrollGateway, L1BaseGateway {
    constructor(
        IArbitrator _arbitrator,
        IScrollMessenger _messageService
    ) L1BaseGateway(_arbitrator) ScrollGateway(_messageService) {
        _disableInitializers();
    }

    function initialize() external initializer {
        __ScrollGateway_init();
    }

    function sendMessage(
        uint256 _value,
        bytes memory _callData,
        bytes memory _adapterParams
    ) external payable override onlyArbitrator {
        uint256 _finalizeMessageGasLimit = abi.decode(_adapterParams, (uint256));

        bytes memory executeData = abi.encodeCall(IMessageClaimer.claimMessageCallback, (_value, _callData));
        MESSAGE_SERVICE.sendMessage{value: msg.value}(
            remoteGateway,
            _value,
            executeData,
            _finalizeMessageGasLimit,
            // solhint-disable-next-line avoid-tx-origin
            tx.origin
        );
    }

    function claimMessageCallback(uint256 _value, bytes memory _callData) external payable override onlyMessageService {
        // no fee
        require(msg.value == _value, "Invalid value");

        // Forward message to arbitrator
        ARBITRATOR.receiveMessage{value: msg.value}(_value, _callData);
    }
}
