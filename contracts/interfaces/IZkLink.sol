// SPDX-License-Identifier: MIT OR Apache-2.0

pragma solidity ^0.8.0;

/// @title ZkLink interface contract
/// @author zk.link
interface IZkLink {
    /// @notice Send l2 requests sync status to primary chain
    /// @param _newTotalSyncedPriorityTxs New sync point
    function syncL2Requests(uint256 _newTotalSyncedPriorityTxs) external payable;

    /// @notice Receive batch root from primary chain
    /// @param _batchNumber The batch number
    /// @param _l2LogsRootHash The L2 to L1 log root hash
    /// @param _forwardEthAmount The forward eth amount
    function syncBatchRoot(uint256 _batchNumber, bytes32 _l2LogsRootHash, uint256 _forwardEthAmount) external payable;

    /// @notice Receive range batch root hash from primary chain
    /// @param _fromBatchNumber The batch number from
    /// @param _toBatchNumber The batch number to
    /// @param _rangeBatchRootHash The accumulation hash of l2LogsRootHash in the range [`_fromBatchNumber`, `_toBatchNumber`]
    /// @param _forwardEthAmount The forward eth amount
    function syncRangeBatchRoot(
        uint256 _fromBatchNumber,
        uint256 _toBatchNumber,
        bytes32 _rangeBatchRootHash,
        uint256 _forwardEthAmount
    ) external payable;

    /// @notice Receive l2 tx hash from primary chain
    /// @param _l2TxHash The l2 tx hash on local chain
    /// @param _primaryChainL2TxHash The l2 tx hash on primary chain
    function syncL2TxHash(bytes32 _l2TxHash, bytes32 _primaryChainL2TxHash) external;
}
