// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IMantleMessenger} from "../../interfaces/mantle/IMantleMessenger.sol";
import {IMessageClaimer} from "../../interfaces/IMessageClaimer.sol";
import {MantleGateway} from "./MantleGateway.sol";
import {L2BaseGateway} from "../L2BaseGateway.sol";

contract MantleL2Gateway is L2BaseGateway, MantleGateway {
    constructor(
        address _zkLink
    ) L2BaseGateway(_zkLink) MantleGateway(IMantleMessenger(0x4200000000000000000000000000000000000007)) {
        _disableInitializers();
    }

    function initialize() external initializer {
        __MantleGateway_init();
    }

    function sendMessage(uint256 _value, bytes calldata _callData) external payable override onlyZkLink {
        require(msg.value == _value, "Invalid fee");

        bytes memory message = abi.encodeCall(IMessageClaimer.claimMessageCallback, (_value, _callData));
        // `_minGasLimit` can be zero here as long as sufficient gas is provided
        // when `finalizeWithdrawalTransaction` is executed on layer one
        // `_otherSideNativeTokenAmount` must be 0. Sending mnt with messages is not supported.
        MESSAGE_SERVICE.sendMessage{value: _value}(0, remoteGateway, message, uint32(0));
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
