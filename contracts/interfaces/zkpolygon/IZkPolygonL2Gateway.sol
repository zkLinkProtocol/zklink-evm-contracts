// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

interface IZkPolygonL2Gateway {
    /// @notice Claim message
    /// @param _value The msg value
    /// @param _callData The call data
    function finalizeMessage(uint256 _value, bytes memory _callData) external payable;
}
