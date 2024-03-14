// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {Inbox, IBridge} from "@arbitrum/nitro-contracts/src/bridge/Inbox.sol";
import {IOutbox} from "@arbitrum/nitro-contracts/src/bridge/Outbox.sol";
import {IArbitrator} from "../../interfaces/IArbitrator.sol";
import {L1BaseGateway} from "../L1BaseGateway.sol";
import {BaseGateway} from "../BaseGateway.sol";
import {IMessageClaimer} from "../../interfaces/IMessageClaimer.sol";

contract ArbitrumL1Gateway is IMessageClaimer, L1BaseGateway, BaseGateway {
    /// @notice Arbitrum inbox on local chain
    Inbox public immutable INBOX;

    /// @dev Modifier to make sure the original sender is gateway on remote chain.
    modifier onlyRemoteGateway() {
        IBridge bridge = INBOX.bridge();
        require(msg.sender == address(bridge), "Not bridge");
        IOutbox outbox = IOutbox(bridge.activeOutbox());
        address l2Sender = outbox.l2ToL1Sender();
        require(l2Sender == remoteGateway, "Not remote gateway");
        _;
    }

    constructor(IArbitrator _arbitrator, Inbox _inbox) L1BaseGateway(_arbitrator) {
        _disableInitializers();
        INBOX = _inbox;
    }

    function initialize() external initializer {
        __BaseGateway_init();
    }

    function sendMessage(
        uint256 _value,
        bytes calldata _callData,
        bytes calldata _adapterParams
    ) external payable onlyArbitrator {
        (uint256 maxSubmissionCost, uint256 gasLimit, uint256 maxFeePerGas) = abi.decode(
            _adapterParams,
            (uint256, uint256, uint256)
        );
        bytes memory data = abi.encodeCall(IMessageClaimer.claimMessageCallback, (_value, _callData));
        // no use of the return value
        INBOX.createRetryableTicket{value: msg.value}(
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

    function claimMessageCallback(uint256 _value, bytes calldata _callData) external payable onlyRemoteGateway {
        require(msg.value == _value, "Invalid value");
        // Forward message to arbitrator
        ARBITRATOR.receiveMessage{value: _value}(_value, _callData);
    }
}
