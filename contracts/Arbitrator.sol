// SPDX-License-Identifier: MIT OR Apache-2.0

pragma solidity ^0.8.0;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {DoubleEndedQueueUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/structs/DoubleEndedQueueUpgradeable.sol";
import {IArbitrator} from "./interfaces/IArbitrator.sol";
import {IL1Gateway} from "./interfaces/IL1Gateway.sol";
import {IAdmin} from "./zksync/l1-contracts/zksync/interfaces/IAdmin.sol";
import {IZkSync} from "./zksync/l1-contracts/zksync/interfaces/IZkSync.sol";
import "./zksync/l1-contracts/zksync/Storage.sol";

/// @title Arbitrator contract
/// @author zk.link
contract Arbitrator is IArbitrator, OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable{
    using DoubleEndedQueueUpgradeable for DoubleEndedQueueUpgradeable.Bytes32Deque;

    /// @dev The gateway for sending message from ethereum to primary chain
    IL1Gateway public primaryChainGateway;
    /// @dev The gateway for sending message from ethereum to secondary chain
    mapping(IL1Gateway => bool) public secondaryChainGateways;
    /// @dev A message hash queue waiting to forward to all secondary chains
    DoubleEndedQueueUpgradeable.Bytes32Deque public primaryChainMessageHashQueue;
    /// @dev A message hash queue waiting to forward to primary chain
    mapping(IL1Gateway => DoubleEndedQueueUpgradeable.Bytes32Deque) public secondaryChainMessageHashQueues;
    /// @notice List of permitted relayers
    mapping(address relayerAddress => bool isRelayer) public relayers;

    /// @notice Primary chain gateway init
    event InitPrimaryChain(IL1Gateway gateway);
    /// @notice SecondaryChain's status changed
    event SecondaryChainStatusUpdate(IL1Gateway gateway, bool isActive);
    /// @notice Relayer's status changed
    event RelayerStatusUpdate(address relayer, bool isActive);
    /// @notice Validator's status changed
    event ValidatorStatusUpdate(IL1Gateway gateway, address validatorAddress, bool isActive);
    /// @notice Fee params for L1->L2 transactions changed
    event NewFeeParams(IL1Gateway gateway, FeeParams newFeeParams);

    /// @notice Checks if relayer is active
    modifier onlyRelayer() {
        require(relayers[msg.sender], "Not relayer"); // relayer is not active
        _;
    }

    function initialize() external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /// @dev Set primary chain
    function setPrimaryChainGateway(IL1Gateway _gateway) external onlyOwner {
        require(address(primaryChainGateway) == address(0), "Duplicate init primary chain gateway");
        primaryChainGateway = _gateway;
        emit InitPrimaryChain(_gateway);
    }

    /// @dev Set secondary chain
    function setSecondaryChainGateway(IL1Gateway _gateway, bool _active, bytes memory _adapterParams) external payable onlyOwner {
        require(_gateway != primaryChainGateway, "Invalid secondary chain gateway");
        secondaryChainGateways[_gateway] = _active;
        bytes memory callData = abi.encodeCall(IZkSync.setSecondaryChainGateway, (address(_gateway), _active));
        // Forward fee to send message
        primaryChainGateway.sendMessage{value: msg.value}(0, callData, _adapterParams);
        emit SecondaryChainStatusUpdate(_gateway, _active);
    }

    /// @dev Set relayer
    function setRelayer(address _relayer, bool _active) external onlyOwner {
        relayers[_relayer] = _active;
        emit RelayerStatusUpdate(_relayer, _active);
    }

    /// @dev Set validator for a chain
    function setValidator(IL1Gateway _gateway, address _validator, bool _active, bytes memory _adapterParams) external payable onlyOwner {
        require(_gateway == primaryChainGateway || secondaryChainGateways[_gateway], "Invalid chain gateway");
        bytes memory callData = abi.encodeCall(IAdmin.setValidator, (_validator, _active));
        // Forward fee to send message
        _gateway.sendMessage{value: msg.value}(0, callData, _adapterParams);
        emit ValidatorStatusUpdate(_gateway, _validator, _active);
    }

    /// @dev Change fee params for a chain
    function changeFeeParams(IL1Gateway _gateway, FeeParams calldata _newFeeParams, bytes memory _adapterParams) external payable onlyOwner {
        require(_gateway == primaryChainGateway || secondaryChainGateways[_gateway], "Invalid chain gateway");
        bytes memory callData = abi.encodeCall(IAdmin.changeFeeParams, (_newFeeParams));
        // Forward fee to send message
        _gateway.sendMessage{value: msg.value}(0, callData, _adapterParams);
        emit NewFeeParams(_gateway, _newFeeParams);
    }

    function receiveMessage(uint256 _value, bytes memory _callData) external payable {
        require(msg.value == _value, "Invalid msg value");
        // store message hash for forwarding
        bytes32 finalizeMessageHash = keccak256(abi.encode(_value, _callData));
        IL1Gateway gateway = IL1Gateway(msg.sender);
        if (gateway == primaryChainGateway) {
            primaryChainMessageHashQueue.pushBack(finalizeMessageHash);
        } else {
            require(secondaryChainGateways[gateway], "Not secondary chain gateway");
            secondaryChainMessageHashQueues[gateway].pushBack(finalizeMessageHash);
        }
    }

    function forwardMessage(IL1Gateway _gateway, uint256 _value, bytes memory _callData, bytes memory _adapterParams) external payable nonReentrant onlyRelayer {
        bytes32 finalizeMessageHash = keccak256(abi.encode(_value, _callData));
        if (_gateway == primaryChainGateway) {
            require(finalizeMessageHash == primaryChainMessageHashQueue.popFront(), "Invalid finalize message hash");
            // Unpack destination chain and final callData
            (IL1Gateway secondaryChainGateway, bytes memory finalCallData) = abi.decode(_callData, (IL1Gateway, bytes));
            require(secondaryChainGateways[secondaryChainGateway], "Invalid secondary chain gateway");
            // Forward fee to send message
            secondaryChainGateway.sendMessage{value: msg.value + _value}(_value, finalCallData, _adapterParams);
        } else {
            require(secondaryChainGateways[_gateway], "Not secondary chain gateway");
            require(finalizeMessageHash == secondaryChainMessageHashQueues[_gateway].popFront(), "Invalid finalize message hash");
            // Forward fee to send message
            primaryChainGateway.sendMessage{value: msg.value + _value}(_value, _callData, _adapterParams);
        }
    }
}