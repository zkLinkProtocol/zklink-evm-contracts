// SPDX-License-Identifier: MIT OR Apache-2.0

pragma solidity ^0.8.0;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {DoubleEndedQueueUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/structs/DoubleEndedQueueUpgradeable.sol";
import {IArbitrator} from "./interfaces/IArbitrator.sol";
import {IL1Gateway} from "./interfaces/IL1Gateway.sol";

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

    /// @notice Checks if relayer is active
    modifier onlyRelayer() {
        require(relayers[msg.sender], "Not relayer"); // relayer is not active
        _;
    }

    function initialize(
        IL1Gateway _primaryChainGateway,
        IL1Gateway[] memory _secondaryChainGateways,
        address[] memory _relayers
    ) external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        primaryChainGateway = _primaryChainGateway;
        for(uint i = 0; i < _secondaryChainGateways.length; ++i) {
            secondaryChainGateways[_secondaryChainGateways[i]] = true;
        }
        for(uint i = 0; i < _relayers.length; ++i) {
            relayers[_relayers[i]] = true;
        }
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

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