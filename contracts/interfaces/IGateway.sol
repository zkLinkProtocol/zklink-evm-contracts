// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

interface IGateway {
    /// @return Remote gateway
    function getRemoteGateway() external view returns (address);

    /// @notice Send message to remote gateway
    /// @param value The msg value
    /// @param callData The call data
    function sendMessage(uint256 value, bytes memory callData) external payable;
}
