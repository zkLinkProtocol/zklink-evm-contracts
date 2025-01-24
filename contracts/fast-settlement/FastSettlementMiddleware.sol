// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {EnumerableMapUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableMapUpgradeable.sol";
import {IRegistry} from "@symbioticfi/core/src/interfaces/common/IRegistry.sol";
import {IVault} from "@symbioticfi/core/src/interfaces/vault/IVault.sol";
import {IBaseDelegator} from "@symbioticfi/core/src/interfaces/delegator/IBaseDelegator.sol";
import {IOptInService} from "@symbioticfi/core/src/interfaces/service/IOptInService.sol";
import {IEntity} from "@symbioticfi/core/src/interfaces/common/IEntity.sol";
import {ISlasher} from "@symbioticfi/core/src/interfaces/slasher/ISlasher.sol";
import {IVetoSlasher} from "@symbioticfi/core/src/interfaces/slasher/IVetoSlasher.sol";
import {Subnetwork} from "@symbioticfi/core/src/contracts/libraries/Subnetwork.sol";

import {MapWithTimeData} from "./libraries/MapWithTimeData.sol";
import {IFastSettlementMiddleware} from "../interfaces/IFastSettlementMiddleware.sol";
import {IArbitrator} from "../interfaces/IArbitrator.sol";
import {IL1Gateway} from "../interfaces/IL1Gateway.sol";

contract FastSettlementMiddleware is IFastSettlementMiddleware, OwnableUpgradeable, UUPSUpgradeable {
    using EnumerableMapUpgradeable for EnumerableMapUpgradeable.AddressToUintMap;
    using MapWithTimeData for EnumerableMapUpgradeable.AddressToUintMap;
    using Subnetwork for address;

    uint96 private constant SUBNETWORK_IDENTIFIER = 0;

    address public immutable NETWORK;
    address public immutable VAULT_FACTORY;
    address public immutable OPERATOR_REGISTRY;
    address public immutable NETWORK_OPT_IN_SERVICE;
    IArbitrator public immutable ARBITRATOR;

    uint48 private constant INSTANT_SLASHER_TYPE = 0;
    uint48 private constant VETO_SLASHER_TYPE = 1;

    uint48 public epochDuration;
    uint48 public slashingWindow;
    uint48 public startTime;
    mapping(uint48 => uint256) public totalStakeCache;
    mapping(uint48 => bool) public totalStakeCached;
    mapping(uint48 => mapping(address => uint256)) public operatorStakeCache;
    EnumerableMapUpgradeable.AddressToUintMap private operators;
    EnumerableMapUpgradeable.AddressToUintMap private vaults;

    error NotOperator();
    error NotVault();
    error OperatorNotOptedIn();
    error OperatorNotRegistered();
    error OperatorAlreadyRegistered();
    error OperatorGracePeriodNotPassed();
    error VaultNotRegistered();
    error VaultAlreadyRegistered();
    error VaultEpochTooShort();
    error VaultGracePeriodNotPassed();
    error TooOldEpoch();
    error InvalidEpoch();

    constructor(
        address _network,
        address _operatorRegistry,
        address _vaultFactory,
        address _networkOptinService,
        IArbitrator _arbitrator
    ) {
        NETWORK = _network;
        OPERATOR_REGISTRY = _operatorRegistry;
        VAULT_FACTORY = _vaultFactory;
        NETWORK_OPT_IN_SERVICE = _networkOptinService;
        ARBITRATOR = _arbitrator;

        _disableInitializers();
    }

    /// @notice Initialize the contract
    function initialize(uint48 _epochDuration, uint48 _slashingWindow) external initializer {
        __Ownable_init_unchained();
        __UUPSUpgradeable_init_unchained();

        startTime = uint48(block.timestamp);
        epochDuration = _epochDuration;
        slashingWindow = _slashingWindow;
    }

    /// @notice Upgrade the contract
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        // can only call by owner
    }

    /// @notice Register operator
    function registerOperator(address operator) external onlyOwner {
        if (operators.contains(operator)) {
            revert OperatorAlreadyRegistered();
        }

        if (!IRegistry(OPERATOR_REGISTRY).isEntity(operator)) {
            revert NotOperator();
        }

        if (!IOptInService(NETWORK_OPT_IN_SERVICE).isOptedIn(operator, NETWORK)) {
            revert OperatorNotOptedIn();
        }

        operators.add(operator);
        operators.enable(operator);
    }

    /// @notice Pause operator
    function pauseOperator(address operator) external onlyOwner {
        operators.disable(operator);
    }

    /// @notice Unpause operator
    function unpauseOperator(address operator) external onlyOwner {
        operators.enable(operator);
    }

    /// @notice Unregister operator
    function unregisterOperator(address operator) external onlyOwner {
        (, uint48 disabledTime) = operators.getTimes(operator);

        if (disabledTime == 0 || disabledTime + slashingWindow > block.timestamp) {
            revert OperatorGracePeriodNotPassed();
        }

        operators.remove(operator);
    }

    /// @notice Register vault
    function registerVault(address vault) external onlyOwner {
        if (vaults.contains(vault)) {
            revert VaultAlreadyRegistered();
        }

        if (!IRegistry(VAULT_FACTORY).isEntity(vault)) {
            revert NotVault();
        }

        uint48 vaultEpoch = IVault(vault).epochDuration();

        address slasher = IVault(vault).slasher();
        if (slasher != address(0) && IEntity(slasher).TYPE() == VETO_SLASHER_TYPE) {
            vaultEpoch -= IVetoSlasher(slasher).vetoDuration();
        }

        if (vaultEpoch < slashingWindow) {
            revert VaultEpochTooShort();
        }

        vaults.add(vault);
        vaults.enable(vault);
    }

    /// @notice Pause vault
    function pauseVault(address vault) external onlyOwner {
        vaults.disable(vault);
    }

    /// @notice Unpause vault
    function unpauseVault(address vault) external onlyOwner {
        vaults.enable(vault);
    }

    /// @notice Unregister vault
    function unregisterVault(address vault) external onlyOwner {
        (, uint48 disabledTime) = vaults.getTimes(vault);

        if (disabledTime == 0 || disabledTime + slashingWindow > block.timestamp) {
            revert VaultGracePeriodNotPassed();
        }

        vaults.remove(vault);
    }

    function pauseArbitrator(bool _paused) external {
        uint48 epoch = getCurrentEpoch();
        uint256 collateral = getOperatorStakeValue(msg.sender, epoch);
        uint256 totalCollateral = getTotalStakeValue(epoch);
        uint256 expectCollateral = (totalCollateral * 2) / 3;
        require(collateral > 0 && collateral >= expectCollateral, "Collateral not enough");
        ARBITRATOR.setPause(_paused);
    }

    /// @notice Return the available stake value for the operator at a specific epoch
    function getOperatorStakeValue(address operator, uint48 epoch) public view returns (uint256 totalStakeValue) {
        if (totalStakeCached[epoch]) {
            return operatorStakeCache[epoch][operator];
        }

        uint48 epochStartTs = getEpochStartTs(epoch);

        for (uint256 i; i < vaults.length(); ++i) {
            (address vault, uint48 enabledTime, uint48 disabledTime) = vaults.atWithTimes(i);

            // just skip the vault if it was enabled after the target epoch or not enabled
            if (!_wasActiveAt(enabledTime, disabledTime, epochStartTs)) {
                continue;
            }

            uint256 vaultCollateral = IBaseDelegator(IVault(vault).delegator()).stakeAt(
                NETWORK.subnetwork(SUBNETWORK_IDENTIFIER),
                operator,
                epochStartTs,
                new bytes(0)
            );

            // only ZKL currently
            totalStakeValue += vaultCollateral;
        }
    }

    /// @notice Return the available stake value for the operator at the current epoch
    function getOperatorStakeCurrentValue(address operator) public view returns (uint256) {
        return getOperatorStakeValue(operator, getCurrentEpoch());
    }

    function getTotalStakeCurrentValue() public view returns (uint256) {
        return getTotalStakeValue(getCurrentEpoch());
    }

    /// @notice Return the total stake value for all operators at a specific epoch
    function getTotalStakeValue(uint48 epoch) public view returns (uint256) {
        if (totalStakeCached[epoch]) {
            return totalStakeCache[epoch];
        }
        return _calcTotalStake(epoch);
    }

    /// @notice Calculate and cache the available stake value
    function calcAndCacheStakes(uint48 epoch) public returns (uint256 totalStakeValue) {
        uint48 epochStartTs = getEpochStartTs(epoch);

        // for epoch older than SLASHING_WINDOW total stake can be invalidated (use cache)
        if (epochStartTs < block.timestamp - slashingWindow) {
            revert TooOldEpoch();
        }

        if (epochStartTs > block.timestamp) {
            revert InvalidEpoch();
        }

        for (uint256 i; i < operators.length(); ++i) {
            (address operator, uint48 enabledTime, uint48 disabledTime) = operators.atWithTimes(i);

            // just skip operator if it was added after the target epoch or paused
            if (!_wasActiveAt(enabledTime, disabledTime, epochStartTs)) {
                continue;
            }

            uint256 operatorStakeValue = getOperatorStakeValue(operator, epoch);
            operatorStakeCache[epoch][operator] = operatorStakeValue;

            totalStakeValue += operatorStakeValue;
        }

        totalStakeCached[epoch] = true;
        totalStakeCache[epoch] = totalStakeValue;
    }

    /// @notice Return the timestamp of a specific epoch
    function getEpochStartTs(uint48 epoch) public view returns (uint48 timestamp) {
        return startTime + epoch * epochDuration;
    }

    /// @notice Return the epoch of a specific timestamp
    function getEpochAtTs(uint48 timestamp) public view returns (uint48 epoch) {
        return (timestamp - startTime) / epochDuration;
    }

    /// @notice Return the current epoch
    function getCurrentEpoch() public view returns (uint48 epoch) {
        return getEpochAtTs(uint48(block.timestamp));
    }

    function wasOperatorActive(address operator, uint48 epoch) external view returns (bool) {
        (uint48 enabledTime, uint48 disabledTime) = operators.getTimes(operator);
        uint48 epochStartTs = getEpochStartTs(epoch);
        return _wasActiveAt(enabledTime, disabledTime, epochStartTs);
    }

    function _calcTotalStake(uint48 epoch) private view returns (uint256 totalStakeValue) {
        uint48 epochStartTs = getEpochStartTs(epoch);

        // for epoch older than SLASHING_WINDOW total stake can be invalidated (use cache)
        if (epochStartTs < block.timestamp - slashingWindow) {
            revert TooOldEpoch();
        }

        if (epochStartTs > block.timestamp) {
            revert InvalidEpoch();
        }

        for (uint256 i; i < operators.length(); ++i) {
            (address operator, uint48 enabledTime, uint48 disabledTime) = operators.atWithTimes(i);

            // just skip operator if it was added after the target epoch or paused
            if (!_wasActiveAt(enabledTime, disabledTime, epochStartTs)) {
                continue;
            }

            uint256 operatorStakeValue = getOperatorStakeValue(operator, epoch);
            totalStakeValue += operatorStakeValue;
        }
    }

    function _wasActiveAt(uint48 enabledTime, uint48 disabledTime, uint48 timestamp) private pure returns (bool) {
        return enabledTime != 0 && enabledTime <= timestamp && (disabledTime == 0 || disabledTime >= timestamp);
    }
}
