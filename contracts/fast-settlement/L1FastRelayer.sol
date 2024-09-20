// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {EnumerableMap} from "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {IRegistry} from "./lib/symbiotic/interfaces/common/IRegistry.sol";
import {IEntity} from "./lib/symbiotic/interfaces/common/IEntity.sol";
import {IVault} from "./lib/symbiotic/interfaces/vault/IVault.sol";
import {IBaseDelegator} from "./lib/symbiotic/interfaces/delegator/IBaseDelegator.sol";
import {IBaseSlasher} from "./lib/symbiotic/interfaces/slasher/IBaseSlasher.sol";
import {IOptInService} from "./lib/symbiotic/interfaces/service/IOptInService.sol";
import {IEntity} from "./lib/symbiotic/interfaces/common/IEntity.sol";
import {ISlasher} from "./lib/symbiotic/interfaces/slasher/ISlasher.sol";
import {IVetoSlasher} from "./lib/symbiotic/interfaces/slasher/IVetoSlasher.sol";
import {Subnetwork} from "./lib/symbiotic/Subnetwork.sol";

import {MapWithTimeData} from "./lib/MapWithTimeData.sol";
import {IFastSettlement} from "../interfaces/IFastSettlement.sol";
import {IArbitrator} from "../interfaces/IArbitrator.sol";
import {IL1Gateway} from "../interfaces/IL1Gateway.sol";

contract L1FastRelayer is OwnableUpgradeable, IFastSettlement {
    using EnumerableMap for EnumerableMap.AddressToUintMap;
    using MapWithTimeData for EnumerableMap.AddressToUintMap;
    using Subnetwork for address;

    error NotOperator();
    error NotVault();

    error OperatorNotOptedIn();
    error OperatorNotRegistred();
    error OperarorGracePeriodNotPassed();
    error OperatorAlreadyRegistred();

    error VaultAlreadyRegistred();
    error VaultEpochTooShort();
    error VaultGracePeriodNotPassed();

    error InvalidSubnetworksCnt();

    error TooOldEpoch();
    error InvalidEpoch();

    /// @notice Arbitrator changed
    event ArbitratorUpdate(IArbitrator indexed old, IArbitrator indexed new_);
    /// @notice Fast sync message sent
    event SendFastSyncMessage(IL1Gateway secondaryChainGateway, uint256 newTotalSyncedPriorityTxs, uint256 syncHash);

    EnumerableMap.AddressToUintMap private operators;
    EnumerableMap.AddressToUintMap private vaults;
    mapping(address => mapping(uint48 => uint256)) public occupiedStakes;

    address public immutable NETWORK;
    address public immutable OPERATOR_REGISTRY;
    address public immutable VAULT_REGISTRY;
    address public immutable OPERATOR_NET_OPTIN;
    address public immutable OWNER;
    uint48 public immutable EPOCH_DURATION;
    uint48 public immutable START_TIME;

    uint32 public lockedEpochsCnt;
    uint256 public subnetworksCnt;

    IArbitrator public arbitrator;

    constructor(
        address _network,
        address _operatorRegistry,
        address _vaultRegistry,
        address _operatorNetOptin,
        address _owner,
        uint48 _epochDuration,
        uint32 _lockedEpochsCnt
    ) {
        START_TIME = SafeCast.toUint48(block.timestamp);
        EPOCH_DURATION = _epochDuration;
        NETWORK = _network;
        OWNER = _owner;
        OPERATOR_REGISTRY = _operatorRegistry;
        VAULT_REGISTRY = _vaultRegistry;
        OPERATOR_NET_OPTIN = _operatorNetOptin;

        lockedEpochsCnt = _lockedEpochsCnt;
        subnetworksCnt = 1;
    }

    function getEpochStartTs(uint48 epoch) public view returns (uint48 timestamp) {
        return START_TIME + epoch * EPOCH_DURATION;
    }

    function getEpochAtTs(uint48 timestamp) public view returns (uint48 epoch) {
        return (timestamp - START_TIME) / EPOCH_DURATION;
    }

    function getCurrentEpoch() public view returns (uint48 epoch) {
        return getEpochAtTs(SafeCast.toUint48(block.timestamp));
    }

    function setSubnetworksCnt(uint256 _subnetworksCnt) external onlyOwner {
        subnetworksCnt = _subnetworksCnt;
    }

    function setLockedEpochsCnt(uint32 _lockedEpochsCnt) external onlyOwner {
        lockedEpochsCnt = _lockedEpochsCnt;
    }

    /// @dev Set new arbitrator
    function setFastSettlement(IArbitrator _newArbitrator) external onlyOwner {
        require(address(_newArbitrator) != address(0), "Invalid arbitrator");
        IArbitrator oldArbitrator = arbitrator;
        if (oldArbitrator != _newArbitrator) {
            arbitrator = _newArbitrator;
            emit ArbitratorUpdate(oldArbitrator, _newArbitrator);
        }
    }

    function getCurrentStake(address operator) public view returns (uint256 stake) {
        uint48 currentEpoch = getCurrentEpoch();
        uint256 totalStake = getOperatorStake(operator, currentEpoch);
        return totalStake;
    }

    /// @dev Get avaliable stake for operator
    function avaliableStake(address operator) public view returns (uint256) {
        uint48 currentEpoch = getCurrentEpoch();
        uint256 totalStake = getOperatorStake(operator, currentEpoch);
        uint256 occupiedStake = 0;
        for (uint32 i = 0; i < lockedEpochsCnt; ++i) {
            occupiedStake += occupiedStakes[operator][currentEpoch - i];
        }
        return totalStake - occupiedStake;
    }

    function getOperatorStake(address operator, uint48 epoch) public view returns (uint256 stake) {
        uint48 epochStartTs = getEpochStartTs(epoch);

        for (uint256 i; i < vaults.length(); ++i) {
            (address vault, uint48 enabledTime, uint48 disabledTime) = vaults.atWithTimes(i);

            // just skip the vault if it was enabled after the target epoch or not enabled
            if (!_wasActiveAt(enabledTime, disabledTime, epochStartTs)) {
                continue;
            }

            for (uint96 j = 0; j < subnetworksCnt; ++j) {
                stake += IBaseDelegator(IVault(vault).delegator()).stakeAt(
                    NETWORK.subnetwork(j), operator, epochStartTs, new bytes(0)
                );
            }
        }

        return stake;
    }

    function _wasActiveAt(uint48 enabledTime, uint48 disabledTime, uint48 timestamp) private pure returns (bool) {
        return enabledTime != 0 && enabledTime <= timestamp && (disabledTime == 0 || disabledTime >= timestamp);
    }

    function registerOperator(address operator) external onlyOwner {
        if (operators.contains(operator)) {
            revert OperatorAlreadyRegistred();
        }

        if (!IRegistry(OPERATOR_REGISTRY).isEntity(operator)) {
            revert NotOperator();
        }

        if (!IOptInService(OPERATOR_NET_OPTIN).isOptedIn(operator, NETWORK)) {
            revert OperatorNotOptedIn();
        }

        operators.add(operator);
        operators.enable(operator);
    }

    /// @dev Send fast sync message to secondary chain via arbitrator
    function sendFastSyncMessage(
        IL1Gateway _secondaryChainGateway,
        uint256 _newTotalSyncedPriorityTxs,
        bytes32 _syncHash
    ) external {
        require(address(arbitrator) != address(0), "Invalid arbitrator");
        require(address(_secondaryChainGateway) != address(0), "Invalid secondary chain gateway");
        uint256 margin = avaliableStake(msg.sender);
        arbitrator.sendFastSyncMessage(_secondaryChainGateway, _newTotalSyncedPriorityTxs, _syncHash, margin);
        emit SendFastSyncMessage(_secondaryChainGateway, _newTotalSyncedPriorityTxs, uint256(_syncHash));
    }

    function registerVault(address vault) external onlyOwner {
        if (vaults.contains(vault)) {
            revert VaultAlreadyRegistred();
        }

        if (!IRegistry(VAULT_REGISTRY).isEntity(vault)) {
            revert NotVault();
        }

        vaults.add(vault);
        vaults.enable(vault);
    }

    function pauseVault(address vault) external onlyOwner {
        vaults.disable(vault);
    }

    function unpauseVault(address vault) external onlyOwner {
        vaults.enable(vault);
    }
}