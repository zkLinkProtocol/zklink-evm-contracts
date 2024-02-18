// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import {IMessageService} from "./IMessageService.sol";

interface IL2MessageService is IMessageService {
    /// @notice Returns coinbase fee when sendMessage
    function minimumFeeInWei() external view returns (uint256);
}
