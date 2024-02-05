// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IZkPolygon} from "../../interfaces/zkpolygon/IZkPolygon.sol";
import {IArbitrator} from "../../interfaces/IArbitrator.sol";
import {L1BaseGateway} from "../L1BaseGateway.sol";
import {IZkPolygonGateway} from "../../interfaces/zkpolygon/IZkPolygonGateway.sol";
import {BaseGateway} from "../BaseGateway.sol";

contract ZkPolygonL1Gateway is IZkPolygonGateway, L1BaseGateway, BaseGateway {
    /// @notice ZkPolygon message service on local chain
    IZkPolygon public immutable messageService;

    uint32 public constant ETH_NETWORK_ID = 1;
    // Default to true
    bool public constant FORCE_UPDATE_GLOBAL_EXIT_ROOT = true;

    modifier onlyMessageService() {
        require(msg.sender == address(messageService), "Not remote gateway");
        _;
    }

    /// @dev A mapping L2 batch number => message number => flag
    /// @dev Used to indicate that zkSync L2 -> L1 message was already processed
    mapping(uint256 => mapping(uint256 => bool)) public isMessageFinalized;

    constructor(IArbitrator _arbitrator, IZkPolygon _messageService) L1BaseGateway(_arbitrator) {
        messageService = _messageService;
    }

    function initialize() external initializer {
        __BaseGateway_init();
    }

    function sendMessage(uint256 _value, bytes memory _callData, bytes memory) external payable onlyArbitrator {
        bytes memory executeData = abi.encodeCall(IZkPolygonGateway.claimMessageCallback, (_value, _callData));
        messageService.bridgeMessage{value: msg.value}(
            ETH_NETWORK_ID,
            remoteGateway,
            FORCE_UPDATE_GLOBAL_EXIT_ROOT,
            executeData
        );
    }

    function claimMessageCallback(uint256 _value, bytes memory _callData) external payable override onlyMessageService {
        require(msg.value == _value, "Invalid value");
        arbitrator.receiveMessage{value: _value}(_value, _callData);
    }
}
