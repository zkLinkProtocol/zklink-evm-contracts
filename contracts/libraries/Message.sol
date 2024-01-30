// SPDX-License-Identifier: MIT OR Apache-2.0

pragma solidity ^0.8.0;

library Message {
    enum MsgType {
        SyncL2Request,
        SyncBatchRoot
    }
}
