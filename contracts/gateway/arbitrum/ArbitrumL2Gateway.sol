// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {ArbSys} from "@arbitrum/nitro-contracts/src/precompiles/ArbSys.sol";
import {L2BaseGateway} from "../L2BaseGateway.sol";
import {AddressAliasHelper} from "../../zksync/l1-contracts/vendor/AddressAliasHelper.sol";
import {IArbitrumGateway} from "../../interfaces/arbitrum/IArbitrumGateway.sol";
import {BaseGateway} from "../BaseGateway.sol";

contract ArbitrumL2Gateway is IArbitrumGateway, L2BaseGateway, BaseGateway {
    /// @notice Arbitrum system contract
    ArbSys public constant ARB_SYS = ArbSys(address(100));

    /// @dev Modifier to make sure the original sender is gateway on remote chain.
    modifier onlyRemoteGateway() {
        require(AddressAliasHelper.undoL1ToL2Alias(msg.sender) == remoteGateway, "Not remote gateway");
        _;
    }

    constructor(address _zkLink) L2BaseGateway(_zkLink) {}

    function initialize() external initializer {
        __BaseGateway_init();
    }

    function sendMessage(uint256 _value, bytes memory _callData) external payable override onlyZkLink {
        // no fee
        require(msg.value == _value, "Invalid value");

        // send message to ArbitrumL1Gateway
        bytes memory message = abi.encodeCall(IArbitrumGateway.claimMessageCallback, (_value, _callData));
        ARB_SYS.sendTxToL1{value: _value}(remoteGateway, message);
    }

    function claimMessageCallback(uint256 _value, bytes memory _callData) external payable onlyRemoteGateway {
        require(msg.value == _value, "Invalid value");

        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = ZKLINK.call{value: _value}(_callData);
        require(success, "Call zkLink failed");
    }
}
