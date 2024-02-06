// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import {IL2Gateway} from "../../../../interfaces/IL2Gateway.sol";

/// @title The interface of the Getters Contract that implements functions for getting contract state from outside the blockchain.
/// @author Matter Labs
/// @custom:security-contact security@matterlabs.dev
interface IGetters {
    /*//////////////////////////////////////////////////////////////
                            CUSTOM GETTERS
    //////////////////////////////////////////////////////////////*/

    /// @return The gateway on local chain
    function getGateway() external view returns (IL2Gateway);

    /// @return The total number of batches that were committed & verified & executed
    function getTotalBatchesExecuted() external view returns (uint256);

    /// @return The total number of priority operations that were added to the priority queue, including all processed ones
    function getTotalPriorityTxs() external view returns (uint256);

    /// @return Whether the address has a validator access
    function isValidator(address _address) external view returns (bool);

    /// @return merkleRoot Merkle root of the tree with L2 logs for the selected batch
    function l2LogsRootHash(uint256 _batchNumber) external view returns (bytes32 merkleRoot);
}
