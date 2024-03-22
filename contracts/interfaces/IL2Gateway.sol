// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IGateway} from "./IGateway.sol";

interface IL2Gateway is IGateway {
    /// @notice Emit when sending a message
    event L2GatewayMessageSent(uint256 value, bytes callData);

    /// @notice Send message to remote gateway
    /// @param _value The msg value
    /// @param _callData The call data
    function sendMessage(uint256 _value, bytes calldata _callData) external payable;
}
