// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {EnumerableSetUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import {IRegistry} from "@symbioticfi/core/src/interfaces/common/IRegistry.sol";
import {IVault} from "@symbioticfi/core/src/interfaces/vault/IVault.sol";
import {IBaseDelegator} from "@symbioticfi/core/src/interfaces/delegator/IBaseDelegator.sol";
import {IOptInService} from "@symbioticfi/core/src/interfaces/service/IOptInService.sol";
import {Subnetwork} from "@symbioticfi/core/src/contracts/libraries/Subnetwork.sol";

import {ITokenPriceOracle} from "../interfaces/ITokenPriceOracle.sol";
import {IFastSettlementMiddleware} from "../interfaces/IFastSettlementMiddleware.sol";
import {IArbitrator} from "../interfaces/IArbitrator.sol";
import {IL1Gateway} from "../interfaces/IL1Gateway.sol";

contract FastSettlementMiddleware is IFastSettlementMiddleware, OwnableUpgradeable, UUPSUpgradeable {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    using Subnetwork for address;

    uint256 private constant RISK_FACTOR_DENUMINATOR = 10000;
    uint96 private constant SUBNETWORK_IDENTIFIER = 0;

    address public immutable NETWORK;
    address public immutable VAULT_FACTORY;
    address public immutable OPERATOR_REGISTRY;
    address public immutable NETWORK_OPTINSERVICE;

    EnumerableSetUpgradeable.AddressSet private operators;
    EnumerableSetUpgradeable.AddressSet private vaults;

    // @notice The risk factor is used to calculate credit for all tokens if it's not set in tokenRiskFactor
    uint256 public riskFactor;
    // @notice The token risk factor will override the riskFactor if it's set
    mapping(address => uint256) public tokenRiskFactor;

    IArbitrator public arbitrator;
    ITokenPriceOracle public tokenPriceOracle;

    error NotOperator();
    error NotVault();
    error OperatorNotOptedIn();
    error OperatorNotRegistred();
    error OperatorAlreadyRegistred();
    error VaultNotRegistred();
    error VaultAlreadyRegistred();
    /// @notice Arbitrator changed
    event ArbitratorUpdate(IArbitrator indexed old, IArbitrator indexed new_);
    /// @notice Fast sync message sent
    event SendFastSyncMessage(IL1Gateway secondaryChainGateway, uint256 newTotalSyncedPriorityTxs, uint256 syncHash);
    /// @notice Risk factor updated
    event RiskFactorUpdate(uint256 riskFactor);
    /// @notice Token risk factor updated
    event TokenRiskFactorUpdate(address indexed token, uint256 riskFactor);
    /// @notice Token price oracle updated
    event TokenPriceOracleUpdate(ITokenPriceOracle indexed old, ITokenPriceOracle indexed new_);

    constructor(address _network, address _operatorRegistry, address _vaultFactory, address _networkOptinService) {
        NETWORK = _network;
        OPERATOR_REGISTRY = _operatorRegistry;
        VAULT_FACTORY = _vaultFactory;
        NETWORK_OPTINSERVICE = _networkOptinService;

        _disableInitializers();
    }

    function initialize() external initializer {
        __Ownable_init_unchained();
        __UUPSUpgradeable_init_unchained();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        // can only call by owner
    }

    /// @dev Set new arbitrator
    function setArbitrator(IArbitrator _newArbitrator) external onlyOwner {
        require(address(_newArbitrator) != address(0), "Invalid arbitrator");
        IArbitrator oldArbitrator = arbitrator;
        if (oldArbitrator != _newArbitrator) {
            arbitrator = _newArbitrator;
            emit ArbitratorUpdate(oldArbitrator, _newArbitrator);
        }
    }

    /// @dev Set new token price oracle
    function setTokenPriceOracle(ITokenPriceOracle _tokenPriceOracle) external onlyOwner {
        require(address(_tokenPriceOracle) != address(0), "Invalid token price oracle");
        ITokenPriceOracle oldTokenPriceOracle = tokenPriceOracle;
        if (oldTokenPriceOracle != _tokenPriceOracle) {
            tokenPriceOracle = _tokenPriceOracle;
            emit TokenPriceOracleUpdate(oldTokenPriceOracle, _tokenPriceOracle);
        }
    }

    /// @dev Set new risk factor
    function setRiskFactor(uint256 _riskFactor) external onlyOwner {
        require(_riskFactor > 0 && _riskFactor <= RISK_FACTOR_DENUMINATOR, "Invalid risk factor");
        riskFactor = _riskFactor;
        emit RiskFactorUpdate(_riskFactor);
    }

    /// @dev Set new token risk factor
    function setTokenRiskFactor(address _token, uint256 _riskFactor) external onlyOwner {
        require(_riskFactor > 0 && _riskFactor <= RISK_FACTOR_DENUMINATOR, "Invalid risk factor");
        tokenRiskFactor[_token] = _riskFactor;
        emit TokenRiskFactorUpdate(_token, _riskFactor);
    }

    /// @dev Register operator
    function registerOperator(address operator) external onlyOwner {
        if (operators.contains(operator)) {
            revert OperatorAlreadyRegistred();
        }

        if (!IRegistry(OPERATOR_REGISTRY).isEntity(operator)) {
            revert NotOperator();
        }

        if (!IOptInService(NETWORK_OPTINSERVICE).isOptedIn(operator, NETWORK)) {
            revert OperatorNotOptedIn();
        }

        operators.add(operator);
    }

    /// @dev Unregister operator
    function unregisterOperator(address operator) external onlyOwner {
        if (!operators.contains(operator)) {
            revert OperatorNotRegistred();
        }
        operators.remove(operator);
    }

    /// @dev Register vault
    function registerVault(address vault) external onlyOwner {
        if (vaults.contains(vault)) {
            revert VaultAlreadyRegistred();
        }

        if (!IRegistry(VAULT_FACTORY).isEntity(vault)) {
            revert NotVault();
        }

        vaults.add(vault);
    }

    /// @dev Unregister vault
    function unregisterVault(address vault) external onlyOwner {
        if (!vaults.contains(vault)) {
            revert VaultNotRegistred();
        }

        vaults.remove(vault);
    }

    /// @dev Get avaliable stake value for operator
    function getOperatorStakeValue(address operator) public view returns (uint256 totalStakeValue) {
        for (uint256 i; i < vaults.length(); ++i) {
            address vault = vaults.at(i);
            uint256 vaultCollateral = IBaseDelegator(IVault(vault).delegator()).stake(
                NETWORK.subnetwork(SUBNETWORK_IDENTIFIER),
                operator
            );

            if (vaultCollateral == 0) {
                continue;
            }

            address collateralToken = IVault(vault).collateral();
            uint256 tokenPrice = tokenPriceOracle.getTokenPrice(collateralToken);
            uint256 _riskFactor = getTokenRiskFactor(collateralToken);
            uint256 stakeValue = (vaultCollateral * tokenPrice * _riskFactor) / RISK_FACTOR_DENUMINATOR;
            totalStakeValue += stakeValue;
        }
        return totalStakeValue;
    }

    /// @dev Send fast sync message to secondary chain via arbitrator
    function sendFastSyncMessage(
        IL1Gateway _secondaryChainGateway,
        uint256 _newTotalSyncedPriorityTxs,
        bytes32 _syncHash,
        uint256 _expectCollateral,
        bytes calldata _forwardParams
    ) external {
        require(address(arbitrator) != address(0), "Invalid arbitrator");
        require(address(_secondaryChainGateway) != address(0), "Invalid secondary chain gateway");
        uint256 collateral = getOperatorStakeValue(msg.sender);
        require(collateral >= _expectCollateral, "Collateral not enough");
        arbitrator.sendFastSyncMessage(
            _secondaryChainGateway,
            _newTotalSyncedPriorityTxs,
            _syncHash,
            collateral,
            _forwardParams
        );
        emit SendFastSyncMessage(_secondaryChainGateway, _newTotalSyncedPriorityTxs, uint256(_syncHash));
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
                    : 1;
    }
}
