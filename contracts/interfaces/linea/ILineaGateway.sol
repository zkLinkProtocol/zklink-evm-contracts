// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

interface ILineaGateway {
    /// @notice Claim message from remote gateway
    /// @param _value The value to be transferred to the gateway on local chain from remote chain
    /// @param _callData The `claimMessageCallback` encoded call data
    /// @param _nonce The message number of Linea message service on remote chain
    function claimMessage(uint256 _value, bytes calldata _callData, uint256 _nonce) external;

    /// @notice Receive callback called by message service
    /// @param _value The message value
    /// @param _callData The message data
    function claimMessageCallback(uint256 _value, bytes calldata _callData) external payable;

    /// @notice Finalize message
    /// @param _value The message value
    /// @param _callData The message data
    function finalizeMessage(uint256 _value, bytes calldata _callData) external payable;
}
