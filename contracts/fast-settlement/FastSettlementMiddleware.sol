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
import {ICollateral} from "../interfaces/symbioticfi/ICollateral.sol";
import {ITokenPriceOracle} from "../interfaces/ITokenPriceOracle.sol";
import {IFastSettlementMiddleware} from "../interfaces/IFastSettlementMiddleware.sol";
import {IArbitrator} from "../interfaces/IArbitrator.sol";
import {IL1Gateway} from "../interfaces/IL1Gateway.sol";

contract FastSettlementMiddleware is IFastSettlementMiddleware, OwnableUpgradeable, UUPSUpgradeable {
    using EnumerableMapUpgradeable for EnumerableMapUpgradeable.AddressToUintMap;
    using MapWithTimeData for EnumerableMapUpgradeable.AddressToUintMap;
    using Subnetwork for address;

    uint256 private constant RISK_FACTOR_DENOMINATOR = 10000;
    uint96 private constant SUBNETWORK_IDENTIFIER = 0;

    address public immutable NETWORK;
    address public immutable VAULT_FACTORY;
    address public immutable OPERATOR_REGISTRY;
    address public immutable NETWORK_OPT_IN_SERVICE;
    uint48 public immutable EPOCH_DURATION;
    uint48 public immutable SLASHING_WINDOW;
    uint48 public immutable START_TIME;
    IArbitrator public immutable ARBITRATOR;
    ITokenPriceOracle public immutable TOKEN_PRICE_ORACLE;

    uint48 private constant INSTANT_SLASHER_TYPE = 0;
    uint48 private constant VETO_SLASHER_TYPE = 1;

    mapping(uint48 => uint256) public totalStakeCache;
    mapping(uint48 => bool) public totalStakeCached;
    mapping(uint48 => mapping(address => uint256)) public operatorStakeCache;
    EnumerableMapUpgradeable.AddressToUintMap private operators;
    EnumerableMapUpgradeable.AddressToUintMap private vaults;
    /// @notice The risk factor is used to calculate credit for all tokens if it's not set in tokenRiskFactor
    uint256 public riskFactor;
    /// @notice The token risk factor will override the riskFactor if it's set
    mapping(address => uint256) public tokenRiskFactor;

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
    /// @notice Fast sync message sent
    event SendFastSyncMessage(
        IL1Gateway indexed secondaryChainGateway,
        uint256 newTotalSyncedPriorityTxs,
        bytes32 syncHash,
        uint256 collateral
    );
    /// @notice Risk factor updated
    event RiskFactorUpdate(uint256 riskFactor);
    /// @notice Token risk factor updated
    event TokenRiskFactorUpdate(address indexed token, uint256 riskFactor);

    constructor(
        address _network,
        address _operatorRegistry,
        address _vaultFactory,
        address _networkOptinService,
        IArbitrator _arbitrator,
        ITokenPriceOracle _tokenPriceOracle,
        uint48 _epochDuration,
        uint48 _slashingWindow
    ) {
        START_TIME = uint48(block.timestamp);
        NETWORK = _network;
        OPERATOR_REGISTRY = _operatorRegistry;
        VAULT_FACTORY = _vaultFactory;
        NETWORK_OPT_IN_SERVICE = _networkOptinService;
        EPOCH_DURATION = _epochDuration;
        SLASHING_WINDOW = _slashingWindow;
        ARBITRATOR = _arbitrator;
        TOKEN_PRICE_ORACLE = _tokenPriceOracle;

        _disableInitializers();
    }

    /// @notice Initialize the contract
    function initialize() external initializer {
        __Ownable_init_unchained();
        __UUPSUpgradeable_init_unchained();
    }

    /// @notice Upgrade the contract
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        // can only call by owner
    }

    /// @notice Set new risk factor
    function setRiskFactor(uint256 _riskFactor) external onlyOwner {
        require(_riskFactor > 0 && _riskFactor <= RISK_FACTOR_DENOMINATOR, "Invalid risk factor");
        riskFactor = _riskFactor;
        emit RiskFactorUpdate(_riskFactor);
    }

    /// @notice Set new token risk factor
    function setTokenRiskFactor(address _token, uint256 _riskFactor) external onlyOwner {
        require(_riskFactor > 0 && _riskFactor <= RISK_FACTOR_DENOMINATOR, "Invalid risk factor");
        tokenRiskFactor[_token] = _riskFactor;
        emit TokenRiskFactorUpdate(_token, _riskFactor);
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

        if (disabledTime == 0 || disabledTime + SLASHING_WINDOW > block.timestamp) {
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

        if (vaultEpoch < SLASHING_WINDOW) {
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

        if (disabledTime == 0 || disabledTime + SLASHING_WINDOW > block.timestamp) {
            revert VaultGracePeriodNotPassed();
        }

        vaults.remove(vault);
    }

    /// @notice Send fast sync message to secondary chain via ARBITRATOR
    /// @param _secondaryChainGateway The secondary chain gateway
    /// @param _newTotalSyncedPriorityTxs The latest fast sync point
    /// @param _syncHash The sync hash
    /// @param _expectCollateral The value of the collateral acquired off-chain
    /// @param _forwardParams The forward params
    function sendFastSyncMessage(
        IL1Gateway _secondaryChainGateway,
        uint256 _newTotalSyncedPriorityTxs,
        bytes32 _syncHash,
        uint256 _expectCollateral,
        bytes calldata _forwardParams
    ) external {
        uint256 collateral = getOperatorStakeCurrentValue(msg.sender);
        require(collateral > 0 && collateral >= _expectCollateral, "Collateral not enough");
        ARBITRATOR.sendFastSyncMessage(
            _secondaryChainGateway,
            _newTotalSyncedPriorityTxs,
            _syncHash,
            collateral,
            _forwardParams
        );
        emit SendFastSyncMessage(_secondaryChainGateway, _newTotalSyncedPriorityTxs, _syncHash, collateral);
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

            if (vaultCollateral == 0) {
                continue;
            }

            address collateralToken = IVault(vault).collateral();
            address assetToken = ICollateral(collateralToken).asset();
            uint256 tokenPrice = TOKEN_PRICE_ORACLE.getTokenPrice(assetToken);
            uint256 _riskFactor = getTokenRiskFactor(collateralToken);
            uint256 stakeValue = (vaultCollateral * tokenPrice * _riskFactor) / RISK_FACTOR_DENOMINATOR;
            totalStakeValue += stakeValue;
        }
    }

    /// @notice Return the available stake value for the operator at the current epoch
    function getOperatorStakeCurrentValue(address operator) public view returns (uint256) {
        return getOperatorStakeValue(operator, getCurrentEpoch());
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
        if (epochStartTs < block.timestamp - SLASHING_WINDOW) {
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
        return START_TIME + epoch * EPOCH_DURATION;
    }

    /// @notice Return the epoch of a specific timestamp
    function getEpochAtTs(uint48 timestamp) public view returns (uint48 epoch) {
        return (timestamp - START_TIME) / EPOCH_DURATION;
    }

    /// @notice Return the current epoch
    function getCurrentEpoch() public view returns (uint48 epoch) {
        return getEpochAtTs(uint48(block.timestamp));
    }

    /// @notice Return the risk factor for token
    /// @dev The risk factor will not be less than 1
    function getTokenRiskFactor(address _token) public view returns (uint256) {
        uint256 risk = tokenRiskFactor[_token];
        return
            risk > 0
                ? risk
                : riskFactor > 0
                    ? riskFactor
                    : RISK_FACTOR_DENOMINATOR;
    }

    function _calcTotalStake(uint48 epoch) private view returns (uint256 totalStakeValue) {
        uint48 epochStartTs = getEpochStartTs(epoch);

        // for epoch older than SLASHING_WINDOW total stake can be invalidated (use cache)
        if (epochStartTs < block.timestamp - SLASHING_WINDOW) {
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
