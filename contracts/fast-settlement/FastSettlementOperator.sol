// SPDX-License-Identifier: MIT OR Apache-2.0

pragma solidity ^0.8.0;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {AccessControlEnumerableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {IOperatorRegistry} from "./lib/symbiotic/interfaces/IOperatorRegistry.sol";
import {IOptInService} from "./lib/symbiotic/interfaces/service/IOptInService.sol";
import {IRegistry} from "./lib/symbiotic/interfaces/common/IRegistry.sol";
import {IFastSettlementMiddleware} from "../interfaces/IFastSettlementMiddleware.sol";
import {IL1Gateway} from "../interfaces/IL1Gateway.sol";

contract FastSettlementOperator is
    Initializable,
    UUPSUpgradeable,
    AccessControlEnumerableUpgradeable,
    ReentrancyGuardUpgradeable
{
    bytes32 public constant SEND_FAST_SYNC_MESSAGE_ROLE = keccak256("SEND_FAST_SYNC_MESSAGE_ROLE");
    address public immutable OPERATOR_REGISTRY;
    address public immutable VAULT_FACTORY;
    address public immutable NETWORK_REGISTRY;
    address public immutable VAULT_OPTINSERVICE;
    address public immutable NETWORK_OPTINSERVICE;
    address public immutable FAST_SETTLEMENT_MIDDLEWARE;

    error NotVaultOrNetwork();

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

    function initialize(address _owner, address _fastSyncMessageSender) public initializer {
        __UUPSUpgradeable_init_unchained();
        __AccessControl_init_unchained();
        _setupRole(DEFAULT_ADMIN_ROLE, _owner);
        _setupRole(SEND_FAST_SYNC_MESSAGE_ROLE, _fastSyncMessageSender);
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

    function sendFastSyncMessage(
        IL1Gateway _secondaryChainGateway,
        uint256 _newTotalSyncedPriorityTxs,
        bytes32 _syncHash,
        uint256 _expectCollateral,
        bytes calldata _forwardParams
    ) external onlyRole(SEND_FAST_SYNC_MESSAGE_ROLE) {
        require(_newTotalSyncedPriorityTxs > 0, "newTotalSyncedPriorityTxs must be greater than 0");
        require(_syncHash != bytes32(0), "syncHash must not be empty");
        IFastSettlementMiddleware(FAST_SETTLEMENT_MIDDLEWARE).sendFastSyncMessage(
            _secondaryChainGateway,
            _newTotalSyncedPriorityTxs,
            _syncHash,
            _expectCollateral,
            _forwardParams
        );
    }
}
