// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

interface IArbitrator {
    /// @notice Forward message from one L1 gateway to another L1 gateway
    /// @param value The msg value
    /// @param callData The call data
    function forwardMessage(uint256 value, bytes memory callData) external payable;
}
