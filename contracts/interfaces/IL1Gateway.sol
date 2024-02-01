// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

interface IL1Gateway {
    /// @notice Send message to remote gateway
    /// @param _value The msg value
    /// @param _callData The call data
    /// @param _adapterParams Some params need to call canonical message service
    function sendMessage(uint256 _value, bytes memory _callData, bytes memory _adapterParams) external payable;
}
