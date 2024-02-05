// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IZkPolygon} from "../../interfaces/zkpolygon/IZkPolygon.sol";
import {IZkPolygonGateway} from "../../interfaces/zkpolygon/IZkPolygonGateway.sol";
import {L2BaseGateway} from "../L2BaseGateway.sol";
import {BaseGateway} from "../BaseGateway.sol";

contract ZkPolygonL2Gateway is IZkPolygonGateway, L2BaseGateway, BaseGateway {
    /// @notice ZkPolygon message service on local chain
    IZkPolygon public immutable MESSAGE_SERVICE;

    uint32 public constant ETH_NETWORK_ID = 0;
    // Default to true
    bool public constant FORCE_UPDATE_GLOBAL_EXIT_ROOT = true;

    /// @dev Modifier to make sure the original sender is messageService on remote chain.
    modifier onlyMessageService() {
        require(msg.sender == address(MESSAGE_SERVICE), "Not remote gateway");
        _;
    }

    constructor(address _zkLink, IZkPolygon _messageService) L2BaseGateway(_zkLink) {
        MESSAGE_SERVICE = _messageService;
    }

    function initialize() external initializer {
        __BaseGateway_init();
    }

    function sendMessage(uint256 _value, bytes memory _callData) external payable onlyZkLink {
        bytes memory executeData = abi.encodeCall(IZkPolygonGateway.claimMessageCallback, (_value, _callData));
        MESSAGE_SERVICE.bridgeMessage{value: msg.value}(
            ETH_NETWORK_ID,
            remoteGateway,
            FORCE_UPDATE_GLOBAL_EXIT_ROOT,
            executeData
        );
    }

    function claimMessageCallback(uint256 _value, bytes memory _callData) external payable onlyMessageService {
        require(msg.value == _value, "Invalid value");
        (bool success, ) = ZKLINK.call{value: _value}(_callData);
        require(success, "Call zkLink failed");
    }
}
