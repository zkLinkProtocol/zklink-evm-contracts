// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IZkPolygon} from "../../interfaces/zkpolygon/IZkPolygon.sol";
import {IZkPolygonGateway} from "../../interfaces/zkpolygon/IZkPolygonGateway.sol";
import {L2BaseGateway} from "../L2BaseGateway.sol";
import {BaseGateway} from "../BaseGateway.sol";

contract ZkPolygonL2Gateway is IZkPolygonGateway, L2BaseGateway, BaseGateway {
    /// @notice ZkPolygon message service on local chain
    IZkPolygon public messageService;

    uint32 public constant ETH_NETWORK_ID = 0;
    // Default to true
    bool public constant FORCE_UPDATE_GLOBAL_EXIT_ROOT = true;

    /// @dev Modifier to make sure the original sender is messageService on remote chain.
    modifier onlyMessageService() {
        require(msg.sender == address(messageService), "Not remote gateway");
        _;
    }
    function initialize(address _zkLink, IZkPolygon _messageService) external initializer {
        __L2BaseGateway_init(_zkLink);
        __BaseGateway_init();

        messageService = _messageService;
    }

    function sendMessage(uint256 _value, bytes memory _callData) external payable onlyZkLink {
        bytes memory executeData = abi.encodeCall(IZkPolygonGateway.claimMessageCallback, (_value, _callData));
        messageService.bridgeMessage{value: msg.value}(
            ETH_NETWORK_ID,
            remoteGateway,
            FORCE_UPDATE_GLOBAL_EXIT_ROOT,
            executeData
        );
    }

    function claimMessageCallback(uint256 _value, bytes memory _callData) external payable onlyMessageService {
        require(msg.value == _value, "Invalid value");
        (bool success, ) = zkLink.call{value: _value}(_callData);
        require(success, "Call zkLink failed");
    }
}
