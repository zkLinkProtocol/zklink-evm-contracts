// SPDX-License-Identifier: MIT OR Apache-2.0

pragma solidity ^0.8.0;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {IArbitrator} from "../interfaces/IArbitrator.sol";
import {IL1Gateway} from "../interfaces/IL1Gateway.sol";

contract DummyArbitrator is IArbitrator, OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable {
    event ReceiveMessage(uint256 value, bytes callData);

    IL1Gateway public primaryChainGateway;

    function initialize() external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function isRelayerActive(address) external pure returns (bool) {
        return false;
    }

    function enqueueMessage(uint256 _value, bytes calldata _callData) external payable {
        require(msg.value == _value, "Invalid msg value");
        emit ReceiveMessage(_value, _callData);
    }

    function receiveMessage(uint256 _value, bytes calldata _callData) external payable {
        require(msg.value == _value, "Invalid msg value");
        emit ReceiveMessage(_value, _callData);
    }

    function forwardMessage(
        IL1Gateway _gateway,
        uint256 _value,
        bytes calldata _callData,
        bytes calldata _adapterParams
    ) external payable {
        // Forward fee to send message
        _gateway.sendMessage{value: msg.value + _value}(_value, _callData, _adapterParams);
    }

    function claimMessage(
        address,
        bytes calldata,
        IL1Gateway,
        uint256,
        bytes calldata,
        bytes calldata
    ) external payable {
        // do nothing
    }
}
