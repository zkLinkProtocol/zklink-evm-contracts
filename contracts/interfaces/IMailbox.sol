// SPDX-License-Identifier: MIT OR Apache-2.0

pragma solidity ^0.8.0;

interface IMailbox {
    /// @notice Receive sync status from secondary chain
    /// @param _secondaryChainGateway The secondary chain gateway address
    /// @param _newTotalSyncedPriorityTxs New sync point
    /// @param _syncHash New sync hash
    /// @param _forwardEthAmount The difference eth amount between two sync points
    function syncL2Requests(address _secondaryChainGateway, uint256 _newTotalSyncedPriorityTxs, bytes32 _syncHash, uint256 _forwardEthAmount) external payable;
}
