// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IZkPolygon} from "../../interfaces/zkpolygon/IZkPolygon.sol";
import {IArbitrator} from "../../interfaces/IArbitrator.sol";
import {L1BaseGateway} from "../L1BaseGateway.sol";
import {IZkPolygonL1Gateway} from "../../interfaces/zkpolygon/IZkPolygonL1Gateway.sol";
import {IZkPolygonL2Gateway} from "../../interfaces/zkpolygon/IZkPolygonL2Gateway.sol";
import {BaseGateway} from "../BaseGateway.sol";

contract ZkPolygonL1Gateway is IZkPolygonL1Gateway, L1BaseGateway, BaseGateway {
    /// @notice ZkPolygon message service on local chain
    IZkPolygon public messageService;


    /// @dev Receive eth from ZkPolygon canonical bridge
    receive() external payable {
    }

    function initialize(IArbitrator _arbitrator, IZkPolygon _messageService) external initializer {
        __L1BaseGateway_init(_arbitrator);
        __BaseGateway_init();

        messageService = _messageService;
    }

    function sendMessage(uint256 _value, bytes memory _callData, bytes memory _adapterParams) external payable onlyArbitrator {
        require(msg.value == _value, "Invalid value");
        messageService.bridgeMessage{value: msg.value}(
            1,
            remoteGateway,
            true,
            _callData
        );
    }

    function finalizeMessage(uint256 _value, bytes memory _callData) external payable nonReentrant {
        // no fee
        require(msg.value == _value, "Invalid value from canonical message service");

        arbitrator.receiveMessage{value: msg.value}(_value, _callData);
    }
}
