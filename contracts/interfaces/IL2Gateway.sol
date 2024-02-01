// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

interface IL2Gateway {
    /// @notice Send message to remote gateway
    /// @param _value The msg value
    /// @param _callData The call data
    function sendMessage(uint256 _value, bytes memory _callData) external payable;
}
