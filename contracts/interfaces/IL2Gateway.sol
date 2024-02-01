// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IGateway} from "./IGateway.sol";

interface IL2Gateway is IGateway {
    /// @notice Send message to remote gateway
    /// @param _value The msg value
    /// @param _callData The call data
    function sendMessage(uint256 _value, bytes memory _callData) external payable;
}
