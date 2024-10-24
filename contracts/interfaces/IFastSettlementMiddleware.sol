// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IL1Gateway} from "./IL1Gateway.sol";
interface IFastSettlementMiddleware {
    function getOperatorStakeValue(address operator, uint48 epoch) external view returns (uint256);

    function sendFastSyncMessage(
        IL1Gateway _secondaryChainGateway,
        uint256 _newTotalSyncedPriorityTxs,
        bytes32 _syncHash,
        uint256 _expectCollateral,
        bytes calldata _forwardParams
    ) external;
}
