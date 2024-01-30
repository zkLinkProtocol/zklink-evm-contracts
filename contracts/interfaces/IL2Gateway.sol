// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {Message} from "../libraries/Message.sol";

interface IL2Gateway {
    /// @notice Send message to L1Gateway
    /// @param msgType The msg type
    /// @param msgData The msg data
    function sendMessage(Message.MsgType msgType, bytes memory msgData) external payable;
}
