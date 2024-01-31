// SPDX-License-Identifier: MIT OR Apache-2.0

pragma solidity ^0.8.0;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {IArbitrator} from "./interfaces/IArbitrator.sol";
import {IGateway} from "./interfaces/IGateway.sol";

/// @title Arbitrator contract
/// @author zk.link
contract Arbitrator is IArbitrator, OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable{

    /// @dev The gateway for sending message from ethereum to primary chain
    IGateway public primaryChainGateway;

    /// @dev The gateway for sending message from ethereum to secondary chain
    mapping(IGateway => bool) public secondaryChainGateways;

    function initialize() external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function forwardMessage(uint256 _value, bytes memory _callData) external payable {
        IGateway gateway = IGateway(msg.sender);
        if (gateway == primaryChainGateway) {
            (IGateway secondaryChainGateway, bytes memory forwardCallData) = abi.decode(_callData, (IGateway, bytes));
            require(secondaryChainGateways[secondaryChainGateway], "Invalid secondary chain gateway");
            secondaryChainGateway.sendMessage{value: msg.value}(_value, forwardCallData);
        } else {
            require(secondaryChainGateways[IGateway(msg.sender)], "Not secondary chain gateway");
            primaryChainGateway.sendMessage{value: msg.value}(_value, _callData);
        }
    }
}