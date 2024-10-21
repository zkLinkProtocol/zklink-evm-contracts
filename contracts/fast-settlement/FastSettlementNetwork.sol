// SPDX-License-Identifier: MIT OR Apache-2.0

pragma solidity ^0.8.0;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {IBaseDelegator} from "./lib/symbiotic/interfaces/delegator/IBaseDelegator.sol";
import {IVault} from "./lib/symbiotic/interfaces/vault/IVault.sol";
import {IVetoSlasher} from "./lib/symbiotic/interfaces/slasher/IVetoSlasher.sol";
import {IMetadataService} from "./lib/symbiotic/interfaces/service/IMetadataService.sol";
import {INetworkMiddlewareService} from "./lib/symbiotic/interfaces/service/INetworkMiddlewareService.sol";
import {INetworkRegistry} from "./lib/symbiotic/interfaces/INetworkRegistry.sol";
import {IRegistry} from "./lib/symbiotic/interfaces/common/IRegistry.sol";

contract FastSettlementNetwork is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
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
        __Pausable_init_unchained();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    modifier checkVault(address vault) {
        require(vault != address(0), "vault must not be zero address");
        require(IRegistry(VAULT_FACTORY).isEntity(vault), "vault not found");
        _;
    }

    function setOwner(address newOwner) public onlyOwner {
        require(newOwner != address(0), "owner must not be zero address");
        _transferOwnership(newOwner);
    }

    function registerNetwork() external onlyOwner {
        INetworkRegistry(NETWORK_REGISTRY).registerNetwork();
    }

    function setMetadataURL(string calldata metadataURL) external onlyOwner {
        require(bytes(metadataURL).length > 0, "metadataURL must not be empty");
        IMetadataService(METADATA_SERVICE).setMetadataURL(metadataURL);
    }

    function setMiddleware(address middleware) external onlyOwner {
        require(middleware != address(0), "middleware must not be zero address");
        INetworkMiddlewareService(NETWORK_MIDDLEWARE_SERVICE).setMiddleware(middleware);
    }

    function setMaxNetworkLimit(address vault, uint96 identifier, uint256 amount) external onlyOwner checkVault(vault) {
        require(amount > 0, "amount must be greater than 0");
        address delegator = IVault(vault).delegator();
        IBaseDelegator(delegator).setMaxNetworkLimit(identifier, amount);
    }

    function setResolver(
        address vault,
        uint96 identifier,
        address resolver_,
        bytes calldata hints
    ) external onlyOwner checkVault(vault) {
        require(resolver_ != address(0), "resolver must not be zero address");
        address slasher = IVault(vault).slasher();
        IVetoSlasher(slasher).setResolver(identifier, resolver_, hints);
    }
}
