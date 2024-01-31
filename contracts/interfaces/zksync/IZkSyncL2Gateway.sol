// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

interface IZkSyncL2Gateway {
    /// @notice Claim message
    /// @param _value The msg value
    /// @param _callData The call data
    function claimMessage(uint256 _value, bytes memory _callData) external payable;
}
