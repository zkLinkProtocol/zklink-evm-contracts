// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IL1Gateway} from "./IL1Gateway.sol";

interface IArbitrator {
    /// @notice Receive message from one L1 gateway to another L1 gateway
    /// @param _value The msg value
    /// @param _callData The call data
    function receiveMessage(uint256 _value, bytes calldata _callData) external payable;

    /// @notice Forward message from one L1 gateway to another L1 gateway
    /// @param _gateway The message source gateway
    /// @param _value The msg value
    /// @param _callData The call data
    /// @param _adapterParams Some params need to call canonical message service
    function forwardMessage(
        IL1Gateway _gateway,
        uint256 _value,
        bytes calldata _callData,
        bytes calldata _adapterParams
    ) external payable;

    /// @notice Claim a message of source chain and deliver it to the target chain
    /// @param _sourceChainCanonicalMessageService The message service to claim message
    /// @param _sourceChainClaimCallData The call data that need to claim message from source chain
    /// @param _targetChainAdapterParams Some params need to call canonical message service of target chain
    function claimMessage(
        address _sourceChainCanonicalMessageService,
        bytes calldata _sourceChainClaimCallData,
        bytes memory _targetChainAdapterParams
    ) external payable;
}
