// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

interface IOptimismGateway {
    /// @notice Finalize the message sent from OptimismGateway
    /// @param _value The message value
    /// @param _callData The message data
    function claimMessageCallback(uint256 _value, bytes memory _callData) external payable;
}
