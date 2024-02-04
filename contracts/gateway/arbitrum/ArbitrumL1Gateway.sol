// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {Inbox, IBridge} from "@arbitrum/nitro-contracts/src/bridge/Inbox.sol";
import {IOutbox} from "@arbitrum/nitro-contracts/src/bridge/Outbox.sol";
import {IArbitrator} from "../../interfaces/IArbitrator.sol";
import {L1BaseGateway} from "../L1BaseGateway.sol";
import {BaseGateway} from "../BaseGateway.sol";
import {IArbitrumGateway} from "../../interfaces/arbitrum/IArbitrumGateway.sol";

contract ArbitrumL1Gateway is IArbitrumGateway, L1BaseGateway, BaseGateway {
    /// @notice Arbitrum inbox on local chain
    Inbox public inbox;

    /// @dev Modifier to make sure the original sender is gateway on remote chain.
    modifier onlyRemoteGateway() {
        IBridge bridge = inbox.bridge();
        require(msg.sender == address(bridge), "Not bridge");
        IOutbox outbox = IOutbox(bridge.activeOutbox());
        address l2Sender = outbox.l2ToL1Sender();
        require(l2Sender == remoteGateway, "Not remote gateway");
        _;
    }

    function initialize(IArbitrator _arbitrator, Inbox _inbox) external initializer {
        __L1BaseGateway_init(_arbitrator);
        __BaseGateway_init();

        inbox = _inbox;
    }

    function sendMessage(
        uint256 _value,
        bytes memory _callData,
        bytes memory _adapterParams
    ) external payable onlyArbitrator {
        (uint256 maxSubmissionCost, uint256 gasLimit, uint256 maxFeePerGas) = abi.decode(
            _adapterParams,
            (uint256, uint256, uint256)
        );
        bytes memory data = abi.encodeCall(IArbitrumGateway.claimMessageCallback, (_value, _callData));
        inbox.createRetryableTicket{value: msg.value}(
            remoteGateway,
            _value,
            maxSubmissionCost,
            // solhint-disable-next-line avoid-tx-origin
            tx.origin,
            remoteGateway,
            gasLimit,
            maxFeePerGas,
            data
        );
    }

    function claimMessageCallback(uint256 _value, bytes memory _callData) external payable onlyRemoteGateway {
        require(msg.value == _value, "Invalid value");
        // Forward message to arbitrator
        arbitrator.receiveMessage{value: _value}(_value, _callData);
    }
}
