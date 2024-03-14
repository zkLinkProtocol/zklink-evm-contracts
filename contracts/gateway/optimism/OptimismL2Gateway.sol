// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IOptimismMessenger} from "../../interfaces/optimism/IOptimismMessenger.sol";
import {IMessageClaimer} from "../../interfaces/IMessageClaimer.sol";
import {OptimismGateway} from "./OptimismGateway.sol";
import {L2BaseGateway} from "../L2BaseGateway.sol";

contract OptimismL2Gateway is L2BaseGateway, OptimismGateway {
    constructor(
        address _zkLink
    ) L2BaseGateway(_zkLink) OptimismGateway(IOptimismMessenger(0x4200000000000000000000000000000000000007)) {
        _disableInitializers();
    }

    function initialize() external initializer {
        __OptimismGateway_init();
    }

    function sendMessage(uint256 _value, bytes calldata _callData) external payable override onlyZkLink {
        require(msg.value == _value, "Invalid fee");

        bytes memory message = abi.encodeCall(IMessageClaimer.claimMessageCallback, (_value, _callData));
        // `_minGasLimit` can be zero here as long as sufficient gas is provided
        // when `finalizeWithdrawalTransaction` is executed on layer one
        MESSAGE_SERVICE.sendMessage{value: _value}(remoteGateway, message, uint32(0));
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
