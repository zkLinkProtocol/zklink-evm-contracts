// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {IRegistry} from "./lib/symbiotic/interfaces/common/IRegistry.sol";
import {IEntity} from "./lib/symbiotic/interfaces/common/IEntity.sol";
import {IVault} from "./lib/symbiotic/interfaces/vault/IVault.sol";
import {IBaseDelegator} from "./lib/symbiotic/interfaces/delegator/IBaseDelegator.sol";
import {IBaseSlasher} from "./lib/symbiotic/interfaces/slasher/IBaseSlasher.sol";
import {IOptInService} from "./lib/symbiotic/interfaces/service/IOptInService.sol";
import {IEntity} from "./lib/symbiotic/interfaces/common/IEntity.sol";
import {ISlasher} from "./lib/symbiotic/interfaces/slasher/ISlasher.sol";
import {Subnetwork} from "./lib/symbiotic/Subnetwork.sol";

import {IFastSettlement} from "../interfaces/IFastSettlement.sol";
import {IArbitrator} from "../interfaces/IArbitrator.sol";
import {IL1Gateway} from "../interfaces/IL1Gateway.sol";

contract L1FastRelayer is Ownable, IFastSettlement {
    using Subnetwork for address;

    error NotOperator();
    error NotVault();

    error OperatorNotOptedIn();
    error OperatorNotRegistred();
    error OperatorAlreadyRegistred();
    error VaultAlreadyRegistred();

    /// @notice Arbitrator changed
    event ArbitratorUpdate(IArbitrator indexed old, IArbitrator indexed new_);
    /// @notice Fast sync message sent
    event SendFastSyncMessage(IL1Gateway secondaryChainGateway, uint256 newTotalSyncedPriorityTxs, uint256 syncHash);

    mapping(address => bool) public operators;
    address public vault;

    address public immutable NETWORK;
    address public immutable OPERATOR_REGISTRY;
    address public immutable VAULT_REGISTRY;
    address public immutable OPERATOR_NET_OPTIN;

    uint256 public subnetworksCnt;

    IArbitrator public arbitrator;

    constructor(
        address _network,
        address _operatorRegistry,
        address _vaultRegistry,
        address _operatorNetOptin
    ) Ownable() {
        NETWORK = _network;
        OPERATOR_REGISTRY = _operatorRegistry;
        VAULT_REGISTRY = _vaultRegistry;
        OPERATOR_NET_OPTIN = _operatorNetOptin;
        subnetworksCnt = 1;
    }

    function setSubnetworksCnt(uint256 _subnetworksCnt) external onlyOwner {
        subnetworksCnt = _subnetworksCnt;
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

    /// @dev Get avaliable stake for operator
    function getOperatorStake(address operator) public view returns (uint256 stake) {
        for (uint96 j = 0; j < subnetworksCnt; ++j) {
            stake += IBaseDelegator(IVault(vault).delegator()).stake(NETWORK.subnetwork(j), operator);
        }
        return stake;
    }

    function setVault(address _vault) external onlyOwner {
        if (!IRegistry(VAULT_REGISTRY).isEntity(_vault)) {
            revert NotVault();
        }
        vault = _vault;
    }

    function registerOperator(address operator) external onlyOwner {
        if (operators[operator]) {
            revert OperatorAlreadyRegistred();
        }

        if (!IRegistry(OPERATOR_REGISTRY).isEntity(operator)) {
            revert NotOperator();
        }

        if (!IOptInService(OPERATOR_NET_OPTIN).isOptedIn(operator, NETWORK)) {
            revert OperatorNotOptedIn();
        }

        operators[operator] = true;
    }

    function unregisterOperator(address operator) external onlyOwner {
        if (!operators[operator]) {
            revert OperatorNotRegistred();
        }
        operators[operator] = false;
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
        uint256 collateral = getOperatorStake(msg.sender);
        require(collateral >= _expectCollateral, "Collateral not enough");
        arbitrator.sendFastSyncMessage(_secondaryChainGateway, _newTotalSyncedPriorityTxs, _syncHash, collateral, _forwardParams);
        emit SendFastSyncMessage(_secondaryChainGateway, _newTotalSyncedPriorityTxs, uint256(_syncHash));
    }
}
