// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IL1Gateway} from "./IL1Gateway.sol";
interface IFastSettlementMiddleware {
    /**
     * @notice Get the available stake value of an operator at a specific epoch
     * @param operator Operator address
     * @param epoch Epoch
     * @return Stake value
     */
    function getOperatorStakeValue(address operator, uint48 epoch) external view returns (uint256);

    /**
     * @notice Get the available stake value for the operator at the current epoch
     * @param operator Operator address
     * @return Stake value
     */
    function getOperatorStakeCurrentValue(address operator) external view returns (uint256);

    /**
     * @notice Send a fast sync message to the secondary chain
     * @param _secondaryChainGateway The secondary chain gateway
     * @param _newTotalSyncedPriorityTxs The latest fast sync point
     * @param _syncHash The sync hash
     * @param _expectCollateral The value of the collateral acquired off-chain
     * @param _forwardParams The forward params
     */
    function sendFastSyncMessage(
        IL1Gateway _secondaryChainGateway,
        uint256 _newTotalSyncedPriorityTxs,
        bytes32 _syncHash,
        uint256 _expectCollateral,
        bytes calldata _forwardParams
    ) external;
}
