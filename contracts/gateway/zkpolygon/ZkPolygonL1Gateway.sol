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
    modifier onlyMessageService() {
        require(msg.sender == address(messageService), "Not remote gateway");
        _;
    }
    uint32 constant ethNetworkid=0;
    uint32 constant zkpolygonNetworkid=1;
    // Default to true
    bool constant forceUpdateGlobalExitRoot=true;

    /// @dev A mapping L2 batch number => message number => flag
    /// @dev Used to indicate that zkSync L2 -> L1 message was already processed
    mapping(uint256 => mapping(uint256 => bool)) public isMessageFinalized;

    /// @dev Receive eth from ZkPolygon canonical bridge
    receive() external payable {
    }
    

    function initialize(IArbitrator _arbitrator, IZkPolygon _messageService) external initializer {
        __L1BaseGateway_init(_arbitrator);
        __BaseGateway_init();

        messageService = _messageService;
    }

    function sendMessage(uint256 _value, bytes memory _callData, bytes memory) external payable onlyArbitrator {
        bytes memory executeData = abi.encodeCall(IZkPolygonL2Gateway.claimMessageCallback, (
            msg.value,
            _callData
            ));
        messageService.bridgeMessage{value: msg.value}(
            zkpolygonNetworkid,
            remoteGateway,
            forceUpdateGlobalExitRoot,
            executeData
        );
    }

    function finalizeMessage(uint256 _value, bytes memory _callData) external payable override onlyMessageService {
        require(msg.value == _value, "Invalid value from canonical message service");
        arbitrator.receiveMessage{value: _value}(_value, _callData);
    }
}