// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IZkLink} from "../../interfaces/IZkLink.sol";
import "@arbitrum/nitro-contracts/src/precompiles/ArbSys.sol";
import {L2BaseGateway} from "../L2BaseGateway.sol";
import {AddressAliasHelper} from "../../AddressAliasHelper.sol";
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

    function initialize(IZkLink _zkLink) external initializer {
        __L2BaseGateway_init(_zkLink);
        __BaseGateway_init();
    }

    function sendMessage(uint256 _value, bytes memory _callData) external payable override onlyZkLink {
        // no fee
        require(msg.value == _value, "Invalid value");

        // send message to ArbitrumL1Gateway
        bytes memory message = abi.encodeCall(IArbitrumGateway.claimMessageCallback, (_value, _callData));
        ARB_SYS.sendTxToL1(remoteGateway, message);
    }

    function claimMessageCallback(uint256 _value, bytes memory _callData) external payable onlyRemoteGateway {
        require(msg.value == _value, "Invalid value from canonical message service");

        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = address(zkLink).call{value: _value}(_callData);
        require(success, "Call zkLink failed");
    }
}
