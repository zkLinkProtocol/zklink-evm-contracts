// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {OptimismL2Gateway} from "./OptimismL2Gateway.sol";

contract MantleL2Gateway is OptimismL2Gateway {
    constructor(address _zkLink) OptimismL2Gateway(_zkLink) {
        _disableInitializers();
    }

    function claimMessageCallback(
        uint256,
        bytes calldata _callData
    ) external payable override onlyMessageService onlyRemoteGateway {
        // eth value bridged to mantle l2 gateway is unexpected
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = ZKLINK.call{value: 0}(_callData);
        require(success, "Call zkLink failed");
    }
}
