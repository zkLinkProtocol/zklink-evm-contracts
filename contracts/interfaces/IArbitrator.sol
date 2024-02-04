// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IL1Gateway} from "./IL1Gateway.sol";

interface IArbitrator {
    /// @notice Receive message from one L1 gateway to another L1 gateway
    /// @param _value The msg value
    /// @param _callData The call data
    function receiveMessage(uint256 _value, bytes memory _callData) external payable;

    /// @notice Forward message from one L1 gateway to another L1 gateway
    /// @param _gateway The message source gateway
    /// @param _value The msg value
    /// @param _callData The call data
    /// @param _adapterParams Some params need to call canonical message service
    function forwardMessage(
        IL1Gateway _gateway,
        uint256 _value,
        bytes memory _callData,
        bytes memory _adapterParams
    ) external payable;
}
