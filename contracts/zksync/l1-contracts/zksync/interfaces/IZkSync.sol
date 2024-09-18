// SPDX-License-Identifier: MIT OR Apache-2.0

pragma solidity ^0.8.0;

interface IZkSync {
    /// @notice Update secondary chain status
    /// @param _gateway The secondary chain gateway
    /// @param _active Active flag
    function setSecondaryChainGateway(address _gateway, bool _active) external;

    /// @notice Receive sync status from secondary chain
    /// @param _secondaryChainGateway The secondary chain gateway address
    /// @param _newTotalSyncedPriorityTxs New sync point
    /// @param _syncHash New sync hash
    /// @param _forwardEthAmount The difference eth amount between two sync points
    function syncL2Requests(
        address _secondaryChainGateway,
        uint256 _newTotalSyncedPriorityTxs,
        bytes32 _syncHash,
        uint256 _forwardEthAmount
    ) external payable;

    /// @notice Receive fast sync status from secondary chain
    /// @param _secondaryChainGateway The secondary chain gateway address
    /// @param _newTotalSyncedPriorityTxs New sync point
    /// @param _syncHash New sync hash
    /// @param _margin The margin that fast settlement provide
    function fastSyncL2Requests(
        address _secondaryChainGateway,
        uint256 _newTotalSyncedPriorityTxs,
        bytes32 _syncHash,
        uint256 _margin
    ) external;
}
