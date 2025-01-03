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
     * @notice Set the pause status of arbitrator
     */
    function pauseArbitrator(bool _paused) external;
}
