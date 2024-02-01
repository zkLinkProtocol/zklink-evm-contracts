// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IScrollGateway} from "../../interfaces/scroll/IScrollGateway.sol";
import {IScrollMessenger} from "../../interfaces/scroll/IScrollMessenger.sol";
import {IZkLink} from "../../interfaces/IZkLink.sol";
import {L2BaseGateway} from "../L2BaseGateway.sol";
import {BaseGateway} from "../BaseGateway.sol";

contract ScrollL2Gateway is IScrollGateway, L2BaseGateway, BaseGateway {
    /// @notice Linea message service on local chain
    IScrollMessenger public messageService;

    /// @dev Modifier to make sure the original sender is messageService on remote chain.
    modifier onlyMessageService() {
        require(msg.sender == address(messageService), "Not remote gateway");
        _;
    }

    function initialize(IZkLink _zkLink, IScrollMessenger _messageService) external initializer {
        __L2BaseGateway_init(_zkLink);
        __BaseGateway_init();

        messageService = _messageService;
    }

    function sendMessage(uint256 _value, bytes memory _calldata) external payable override onlyZkLink {
        // no fee
        require(msg.value == _value, "Invalid value");

        bytes memory callData = abi.encodeCall(IScrollGateway.finalizeMessage, (_value, _calldata));
        // transfer no fee to L1
        messageService.sendMessage{value: _value}(
            remoteGateway,
            _value,
            callData,
            0 // Gas limit required to complete the deposit on L1. This is optional, send 0 if you don’t want to set it.
        );
    }

    function finalizeMessage(uint256 _value, bytes memory _callData) external payable override onlyMessageService {
        require(msg.value == _value, "Invalid value from canonical message service");

        // solhint-disable-next-line avoid-low-level-calls
        (bool success,) = address(zkLink).call{value: _value}(_callData);
        require(success, "Call zkLink failed");
    }
}
