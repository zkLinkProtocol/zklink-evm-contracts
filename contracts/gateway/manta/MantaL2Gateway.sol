// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IMantaMessenger} from "../../interfaces/manta/IMantaMessenger.sol";
import {IMantaGateway} from "../../interfaces/manta/IMantaGateway.sol";
import {MantaGateway} from "./MantaGateway.sol";
import {L2BaseGateway} from "../L2BaseGateway.sol";

contract MantaL2Gateway is L2BaseGateway, MantaGateway {
    constructor(
        address _zkLink
    ) L2BaseGateway(_zkLink) MantaGateway(IMantaMessenger(0x4200000000000000000000000000000000000007)) {
        _disableInitializers();
    }

    function initialize() external initializer {
        __MantaGateway_init();
    }

    function sendMessage(uint256 value, bytes memory callData) external payable override onlyZkLink {
        require(msg.value == value, "Invalid fee");

        bytes memory message = abi.encodeCall(IMantaGateway.claimMessageCallback, (value, callData));
        // `_minGasLimit` can be zero here as long as sufficient gas is provided
        // when `finalizeWithdrawalTransaction` is executed on layer one
        MESSAGE_SERVICE.sendMessage{value: value}(remoteGateway, message, uint32(0));
    }

    function claimMessageCallback(
        uint256 _value,
        bytes calldata _callData
    ) external payable onlyMessageService onlyRemoteGateway {
        require(msg.value == _value, "Invalid value");

        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = ZKLINK.call{value: _value}(_callData);
        require(success, "Call zkLink failed");
    }
}
