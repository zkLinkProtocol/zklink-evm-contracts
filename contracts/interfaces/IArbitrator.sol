// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IL1Gateway} from "./IL1Gateway.sol";

interface IArbitrator {
    /// @notice Return true if relayer is active
    function isRelayerActive(address _relayer) external view returns (bool);

    /// @notice Return the primary chain gateway
    function primaryChainGateway() external view returns (IL1Gateway);

    /// @notice Enqueue message from EthereumGateway
    /// @dev Used by EthereumGateway to temporarily store message
    /// @param _value The msg value
    /// @param _callData The call data
    function enqueueMessage(uint256 _value, bytes calldata _callData) external payable;

    /// @notice Deliver message from one L1 gateway to another L1 gateway
    /// @dev Used by L1Gateways to deliver message
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
    /// @param _sourceChainL1Gateway The msg.sender passed in the `receiveMessage` interface
    /// @param _receiveValue The value passed in the `receiveMessage` interface
    /// @param _receiveCallData The call data passed in the `receiveMessage` interface
    /// @param _forwardParams Some params need to call canonical message service of target chain
    function claimMessage(
        address _sourceChainCanonicalMessageService,
        bytes calldata _sourceChainClaimCallData,
        IL1Gateway _sourceChainL1Gateway,
        uint256 _receiveValue,
        bytes calldata _receiveCallData,
        bytes calldata _forwardParams
    ) external payable;

    /// @notice Send fast sync message of secondary chain to the primary chain
    /// @param _secondaryChainGateway The secondary chain gateway
    /// @param _newTotalSyncedPriorityTxs The call data that need to claim message from source chain
    /// @param _newTotalSyncedPriorityTxs New sync point
    /// @param _syncHash New sync hash
    /// @param _collateral The collateral that fast settlement provide
    function sendFastSyncMessage(
        IL1Gateway _secondaryChainGateway,
        uint256 _newTotalSyncedPriorityTxs,
        bytes32 _syncHash,
        uint256 _collateral
    ) external;
}
