// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IZkPolygon} from "../../interfaces/zkpolygon/IZkPolygon.sol";
import {IArbitrator} from "../../interfaces/IArbitrator.sol";
import {L1BaseGateway} from "../L1BaseGateway.sol";
import {IBridgeMessageReceiver} from "../../interfaces/zkpolygon/IBridgeMessageReceiver.sol";
import {BaseGateway} from "../BaseGateway.sol";

contract ZkPolygonL1Gateway is IBridgeMessageReceiver, L1BaseGateway, BaseGateway {
    /// @notice ZkPolygon message service on local chain
    IZkPolygon public immutable MESSAGE_SERVICE;

    uint32 public constant ETH_NETWORK_ID = 1;
    // Default to true
    bool public constant FORCE_UPDATE_GLOBAL_EXIT_ROOT = true;

    modifier onlyMessageService() {
        require(msg.sender == address(MESSAGE_SERVICE), "Not remote gateway");
        _;
    }

    /// @dev A mapping L2 batch number => message number => flag
    /// @dev Used to indicate that zkSync L2 -> L1 message was already processed
    mapping(uint256 => mapping(uint256 => bool)) public isMessageFinalized;

    constructor(IArbitrator _arbitrator, IZkPolygon _messageService) L1BaseGateway(_arbitrator) {
        _disableInitializers();
        MESSAGE_SERVICE = _messageService;
    }

    function initialize() external initializer {
        __BaseGateway_init();
    }

    function sendMessage(uint256 _value, bytes memory _callData, bytes memory) external payable onlyArbitrator {
        bytes memory executeData = abi.encode(_value, _callData);
        MESSAGE_SERVICE.bridgeMessage{value: msg.value}(
            ETH_NETWORK_ID,
            remoteGateway,
            FORCE_UPDATE_GLOBAL_EXIT_ROOT,
            executeData
        );
    }

    function onMessageReceived(
        address originAddress,
        uint32,
        bytes memory data
    ) external payable override onlyMessageService {
        require(originAddress == remoteGateway, "Invalid origin address");

        (uint256 _value, bytes memory _callData) = abi.decode(data, (uint256, bytes));
        require(msg.value == _value, "Invalid value");

        ARBITRATOR.receiveMessage{value: _value}(_value, _callData);
    }
}
