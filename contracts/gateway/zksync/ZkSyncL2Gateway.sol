// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IL2ETHToken} from "../../interfaces/zksync/IL2ETHToken.sol";
import {L2BaseGateway} from "../L2BaseGateway.sol";
import {AddressAliasHelper} from "../../zksync/l1-contracts/vendor/AddressAliasHelper.sol";
import {IMessageClaimer} from "../../interfaces/IMessageClaimer.sol";
import {BaseGateway} from "../BaseGateway.sol";

contract ZkSyncL2Gateway is IMessageClaimer, L2BaseGateway, BaseGateway {
    uint160 internal constant SYSTEM_CONTRACTS_OFFSET = 0x8000; // 2^15

    /// @notice ZkSync eth bridge service on local chain
    IL2ETHToken public constant L2_ETH_ADDRESS = IL2ETHToken(address(SYSTEM_CONTRACTS_OFFSET + 0x0a));

    /// @dev Modifier to make sure the original sender is gateway on remote chain.
    modifier onlyRemoteGateway() {
        require(AddressAliasHelper.undoL1ToL2Alias(msg.sender) == remoteGateway, "Not remote gateway");
        _;
    }

    constructor(address _zkLink) L2BaseGateway(_zkLink) {
        _disableInitializers();
    }

    function initialize() external initializer {
        __BaseGateway_init();
    }

    function sendMessage(uint256 _value, bytes calldata _callData) external payable override onlyZkLink {
        // no fee
        require(msg.value == _value, "Invalid value");

        bytes memory message = abi.encodePacked(_value, _callData);
        L2_ETH_ADDRESS.withdrawWithMessage{value: _value}(remoteGateway, message);
        emit L2GatewayMessageSent(_value, _callData);
    }

    function claimMessageCallback(uint256 _value, bytes calldata _callData) external payable onlyRemoteGateway {
        require(msg.value == _value, "Invalid value");

        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = ZKLINK.call{value: _value}(_callData);
        require(success, "Call zkLink failed");
    }
}
