// SPDX-License-Identifier: MIT OR Apache-2.0

pragma solidity ^0.8.0;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {AccessControlEnumerableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IOperatorRegistry} from "@symbioticfi/core/src/interfaces/IOperatorRegistry.sol";
import {IOptInService} from "@symbioticfi/core/src/interfaces/service/IOptInService.sol";
import {IRegistry} from "@symbioticfi/core/src/interfaces/common/IRegistry.sol";
import {IVault} from "@symbioticfi/core/src/interfaces/vault/IVault.sol";
import {IFastSettlementMiddleware} from "../interfaces/IFastSettlementMiddleware.sol";
import {IL1Gateway} from "../interfaces/IL1Gateway.sol";

contract FastSettlementOperator is
    Initializable,
    UUPSUpgradeable,
    AccessControlEnumerableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATE_ROLE = keccak256("OPERATE_ROLE");
    address public immutable OPERATOR_REGISTRY;
    address public immutable VAULT_FACTORY;
    address public immutable NETWORK_REGISTRY;
    address public immutable VAULT_OPTINSERVICE;
    address public immutable NETWORK_OPTINSERVICE;
    address public immutable FAST_SETTLEMENT_MIDDLEWARE;

    error NotVaultOrNetwork();
    error NotVault();

    enum EntityType {
        Vault,
        Network
    }

    constructor(
        address _operatorRegistry,
        address _vaultOptInService,
        address _networkOptInService,
        address _vaultFactory,
        address _networkRegistry,
        address _fastSettlementMiddleware
    ) {
        _disableInitializers();

        OPERATOR_REGISTRY = _operatorRegistry;
        VAULT_OPTINSERVICE = _vaultOptInService;
        NETWORK_OPTINSERVICE = _networkOptInService;
        VAULT_FACTORY = _vaultFactory;
        NETWORK_REGISTRY = _networkRegistry;
        FAST_SETTLEMENT_MIDDLEWARE = _fastSettlementMiddleware;
    }

    function initialize(address _owner, address _operator) public initializer {
        __UUPSUpgradeable_init_unchained();
        __AccessControl_init_unchained();
        _setupRole(DEFAULT_ADMIN_ROLE, _owner);
        _setupRole(OPERATE_ROLE, _operator);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    function registerOperator() external onlyRole(DEFAULT_ADMIN_ROLE) {
        IOperatorRegistry(OPERATOR_REGISTRY).registerOperator();
    }

    function optIn(address where, EntityType entityType) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _optInOut(where, entityType, true);
    }

    function optOut(address where, EntityType entityType) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _optInOut(where, entityType, false);
    }

    function _optInOut(address where, EntityType entityType, bool isOptIn) internal {
        address optInService;
        address entityRegistry;

        if (entityType == EntityType.Vault) {
            optInService = VAULT_OPTINSERVICE;
            entityRegistry = VAULT_FACTORY;
        } else {
            optInService = NETWORK_OPTINSERVICE;
            entityRegistry = NETWORK_REGISTRY;
        }
        if (!IRegistry(entityRegistry).isEntity(where)) revert NotVaultOrNetwork();

        if (isOptIn) {
            IOptInService(optInService).optIn(where);
        } else {
            IOptInService(optInService).optOut(where);
        }
    }

    function deposit(IVault vault, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!IRegistry(VAULT_FACTORY).isEntity(address(vault))) {
            revert NotVault();
        }
        IERC20 token = IERC20(vault.collateral());
        token.safeIncreaseAllowance(address(vault), amount);
        vault.deposit(address(this), amount);
    }

    function withdraw(IVault vault, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!IRegistry(VAULT_FACTORY).isEntity(address(vault))) {
            revert NotVault();
        }
        vault.withdraw(address(this), amount);
    }

    function redeem(IVault vault, uint256 shares) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!IRegistry(VAULT_FACTORY).isEntity(address(vault))) {
            revert NotVault();
        }
        vault.redeem(address(this), shares);
    }

    function claim(IVault vault, uint256 epoch, address recipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!IRegistry(VAULT_FACTORY).isEntity(address(vault))) {
            revert NotVault();
        }
        vault.claim(recipient, epoch);
    }

    function claimBatch(IVault vault, uint256[] calldata epochs, address recipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!IRegistry(VAULT_FACTORY).isEntity(address(vault))) {
            revert NotVault();
        }
        vault.claimBatch(recipient, epochs);
    }

    function pauseArbitrator(bool _paused) external onlyRole(OPERATE_ROLE) {
        IFastSettlementMiddleware(FAST_SETTLEMENT_MIDDLEWARE).pauseArbitrator(_paused);
    }
}
