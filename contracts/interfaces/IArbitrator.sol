// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

interface IArbitrator {
    /// @notice Receive message from one L1 gateway to another L1 gateway
    /// @param _value The msg value
    /// @param _callData The call data
    function receiveMessage(uint256 _value, bytes memory _callData) external payable;
}
