// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

interface IZkSyncL2Gateway {
    /// @notice Claim message
    /// @param value The msg value
    /// @param callData The call data
    function claimMessage(uint256 value, bytes memory callData) external payable;
}
