// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IZkPolygon} from "../../interfaces/zkpolygon/IZkPolygon.sol";
import {IZkPolygonL1Gateway} from "../../interfaces/zkpolygon/IZkPolygonL1Gateway.sol";
import {IZkPolygonL2Gateway} from "../../interfaces/zkpolygon/IZkPolygonL2Gateway.sol";
import {L2BaseGateway} from "../L2BaseGateway.sol";
import {BaseGateway} from "../BaseGateway.sol";

contract ZkPolygonL2Gateway is IZkPolygonL2Gateway, L2BaseGateway, BaseGateway {
    /// @notice ZkPolygon message service on local chain
    IZkPolygon public messageService;

    uint32 constant ethNetworkid=0;
    uint32 constant zkpolygonNetworkid=1;
    // Default to true
    bool constant forceUpdateGlobalExitRoot=true;
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
        bytes memory executeData = abi.encodeCall(IZkPolygonL1Gateway.finalizeMessage, (
            msg.value,
            _callData
            ));
        messageService.bridgeMessage{value: msg.value}(
            ethNetworkid,
            remoteGateway,
            forceUpdateGlobalExitRoot,
            executeData
        );
    }

    function claimMessageCallback(uint256 _value, bytes memory _callData) external payable  onlyMessageService {
        require(msg.value == _value, "Invalid value from canonical message service");
        (bool success,) = zkLink.call{value: _value}(_callData);
        require(success, "Call zkLink failed");
    }
}
