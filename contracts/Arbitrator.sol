// SPDX-License-Identifier: MIT OR Apache-2.0

pragma solidity ^0.8.0;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {DoubleEndedQueueUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/structs/DoubleEndedQueueUpgradeable.sol";
import {IArbitrator} from "./interfaces/IArbitrator.sol";
import {IGateway} from "./interfaces/IGateway.sol";

/// @title Arbitrator contract
/// @author zk.link
contract Arbitrator is IArbitrator, OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable{
    using DoubleEndedQueueUpgradeable for DoubleEndedQueueUpgradeable.Bytes32Deque;

    /// @dev The gateway for sending message from ethereum to primary chain
    IGateway public primaryChainGateway;

    /// @dev The gateway for sending message from ethereum to secondary chain
    mapping(IGateway => bool) public secondaryChainGateways;

    /// @dev A message hash queue waiting to forward to all secondary chains
    DoubleEndedQueueUpgradeable.Bytes32Deque public primaryChainMessageHashQueue;

    /// @dev A message hash queue waiting to forward to primary chain
    mapping(IGateway => DoubleEndedQueueUpgradeable.Bytes32Deque) public secondaryChainMessageHashQueues;

    /// @notice List of permitted relayers
    mapping(address relayerAddress => bool isRelayer) public relayers;

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

    function receiveMessage(uint256 _value, bytes memory _callData) external payable {
        require(msg.value == _value, "Invalid msg value");
        // store message hash for forwarding
        bytes32 finalizeMessageHash = keccak256(abi.encode(_value, _callData));
        IGateway gateway = IGateway(msg.sender);
        if (gateway == primaryChainGateway) {
            primaryChainMessageHashQueue.pushBack(finalizeMessageHash);
        } else {
            require(secondaryChainGateways[gateway], "Not secondary chain gateway");
            secondaryChainMessageHashQueues[gateway].pushBack(finalizeMessageHash);
        }
    }

    function forwardMessage(uint256 _value, bytes memory _callData, bytes memory _adapterParams) external payable nonReentrant onlyRelayer {

    }
}