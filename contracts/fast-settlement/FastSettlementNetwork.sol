// SPDX-License-Identifier: MIT OR Apache-2.0

pragma solidity ^0.8.0;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {IBaseDelegator} from "./lib/symbiotic/interfaces/delegator/IBaseDelegator.sol";
import {IVault} from "./lib/symbiotic/interfaces/vault/IVault.sol";
import {IVetoSlasher} from "./lib/symbiotic/interfaces/slasher/IVetoSlasher.sol";
import {IMetadataService} from "./lib/symbiotic/interfaces/service/IMetadataService.sol";
import {INetworkMiddlewareService} from "./lib/symbiotic/interfaces/service/INetworkMiddlewareService.sol";
import {INetworkRegistry} from "./lib/symbiotic/interfaces/INetworkRegistry.sol";
import {IRegistry} from "./lib/symbiotic/interfaces/common/IRegistry.sol";

contract FastSettlementNetwork is Initializable, UUPSUpgradeable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    address public immutable NETWORK_REGISTRY;
    address public immutable METADATA_SERVICE;
    address public immutable NETWORK_MIDDLEWARE_SERVICE;

    address public immutable VAULT_FACTORY;

    constructor(
        address _networkRegistry,
        address _metadataService,
        address _networkMiddlewareService,
        address _vaultFactory
    ) {
        _disableInitializers();

        NETWORK_REGISTRY = _networkRegistry;
        METADATA_SERVICE = _metadataService;
        NETWORK_MIDDLEWARE_SERVICE = _networkMiddlewareService;
        VAULT_FACTORY = _vaultFactory;
    }

    function initialize() public initializer {
        __UUPSUpgradeable_init_unchained();
        __Ownable_init_unchained();
        __ReentrancyGuard_init_unchained();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    modifier checkVault(address vault) {
        require(IRegistry(VAULT_FACTORY).isEntity(vault), "vault not found");
        _;
    }

    function registerNetwork() external onlyOwner {
        INetworkRegistry(NETWORK_REGISTRY).registerNetwork();
    }

    function setMetadataURL(string calldata metadataURL) external onlyOwner {
        IMetadataService(METADATA_SERVICE).setMetadataURL(metadataURL);
    }

    function setMiddleware(address middleware) external onlyOwner {
        INetworkMiddlewareService(NETWORK_MIDDLEWARE_SERVICE).setMiddleware(middleware);
    }

    function setMaxNetworkLimit(address vault, uint96 identifier, uint256 amount) external onlyOwner checkVault(vault) {
        address delegator = IVault(vault).delegator();
        IBaseDelegator(delegator).setMaxNetworkLimit(identifier, amount);
    }

    function setResolver(
        address vault,
        uint96 identifier,
        address resolver_,
        bytes calldata hints
    ) external onlyOwner checkVault(vault) {
        address slasher = IVault(vault).slasher();
        IVetoSlasher(slasher).setResolver(identifier, resolver_, hints);
    }
}
