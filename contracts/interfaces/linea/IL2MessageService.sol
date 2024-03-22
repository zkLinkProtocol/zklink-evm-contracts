// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import {IMessageService} from "./IMessageService.sol";

interface IL2MessageService is IMessageService {
    /// @notice Returns the fee charged by Linea canonical message service when sending a message
    function minimumFeeInWei() external view returns (uint256);
}
