// SPDX-License-Identifier: MIT OR Apache-2.0

pragma solidity ^0.8.0;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import {IL1Gateway} from "../interfaces/IL1Gateway.sol";
import {IArbitrator} from "../interfaces/IArbitrator.sol";
import {IZkLink} from "../interfaces/IZkLink.sol";

contract SyncL2TxHashRelayer is OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable {
    /// @dev The address of the primary chain message service
    address public immutable PRIMARY_CHAIN_MESSAGE_SERVICE;

    /// @dev The address of the arbitrator contract
    IArbitrator public immutable ARBITRATOR;

    /// @dev The gateway for sending message from ethereum to primary chain
    IL1Gateway public immutable PRIMARY_CHAIN_GATEWAY;

    constructor(address _primaryChainMessageService, IArbitrator _arbitrator, IL1Gateway _primaryChainGateway) {
        _disableInitializers();

        PRIMARY_CHAIN_MESSAGE_SERVICE = _primaryChainMessageService;
        ARBITRATOR = _arbitrator;
        PRIMARY_CHAIN_GATEWAY = _primaryChainGateway;
    }

    function initialize() external initializer {
        __Ownable_init_unchained();
        __UUPSUpgradeable_init_unchained();
        __ReentrancyGuard_init_unchained();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        // can only call by owner
    }

    function claimPrimaryChainSyncL2TxHashMessage(
        address _sourceChainCanonicalMessageService,
        bytes calldata _sourceChainClaimCallData,
        address _secondaryChainGateway,
        bytes32 _canonicalTxHash,
        bytes32 _l2TxHash,
        bytes calldata _forwardParams
    ) external payable nonReentrant {
        require(_sourceChainCanonicalMessageService == PRIMARY_CHAIN_MESSAGE_SERVICE, "INVALID_MESSAGE_SERVICE");

        // Send l2 tx hash to secondary chain by gateway
        bytes[] memory gatewayDataList = new bytes[](1);
        bytes memory callData = abi.encodeCall(IZkLink.syncL2TxHash, (_canonicalTxHash, _l2TxHash));
        gatewayDataList[0] = abi.encode(_secondaryChainGateway, 0, callData);

        ARBITRATOR.claimMessage{value: msg.value}(
            _sourceChainCanonicalMessageService,
            _sourceChainClaimCallData,
            PRIMARY_CHAIN_GATEWAY,
            0,
            abi.encode(gatewayDataList),
            _forwardParams
        );
    }
}
