// SPDX-License-Identifier: MIT OR Apache-2.0

pragma solidity ^0.8.0;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {IL2Gateway} from "../interfaces/IL2Gateway.sol";
import {IZkLink} from "../interfaces/IZkLink.sol";

contract DummyZkLink is IZkLink, OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable {
    IL2Gateway public gateway;

    event ReceiveBatchRoot(uint256 batchNumber, bytes32 l2LogsRootHash, uint256 forwardEthAmount);
    event ReceiveL2TxHash(bytes32 l2TxHash, bytes32 primaryChainL2TxHash);

    modifier onlyGateway() {
        require(msg.sender == address(gateway), "Not gateway");
        _;
    }

    function initialize() external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function getGateway() external view returns (IL2Gateway) {
        return gateway;
    }

    function setGateway(IL2Gateway _gateway) external {
        require(address(gateway) == address(0), "Duplicate init gateway");
        gateway = _gateway;
    }

    function syncL2Requests(uint256 _newTotalSyncedPriorityTxs) external payable {
        bytes memory callData = abi.encode(0, _newTotalSyncedPriorityTxs);
        gateway.sendMessage{value: msg.value}(0, callData);
    }

    function syncBatchRoot(
        uint256 _batchNumber,
        bytes32 _l2LogsRootHash,
        uint256 _forwardEthAmount
    ) external payable onlyGateway {
        emit ReceiveBatchRoot(_batchNumber, _l2LogsRootHash, _forwardEthAmount);
    }

    function syncL2TxHash(bytes32 _l2TxHash, bytes32 _primaryChainL2TxHash) external onlyGateway {
        emit ReceiveL2TxHash(_l2TxHash, _primaryChainL2TxHash);
    }
}
