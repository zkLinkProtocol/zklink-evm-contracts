// SPDX-License-Identifier: MIT OR Apache-2.0

pragma solidity ^0.8.0;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import {IL1Gateway} from "../interfaces/IL1Gateway.sol";
import {IArbitrator} from "../interfaces/IArbitrator.sol";
import {IZkLink} from "../interfaces/IZkLink.sol";

contract SyncL2TxHashRelayer is ReentrancyGuard {
    /// @dev The address of the primary chain message service
    address public immutable PRIMARY_CHAIN_MESSAGE_SERVICE;

    /// @dev The address of the arbitrator contract
    IArbitrator public immutable ARBITRATOR;

    constructor(address _primaryChainMessageService, IArbitrator _arbitrator) {
        PRIMARY_CHAIN_MESSAGE_SERVICE = _primaryChainMessageService;
        ARBITRATOR = _arbitrator;
    }

    function claimPrimaryChainSyncL2TxHashMessage(
        address _sourceChainCanonicalMessageService,
        bytes calldata _sourceChainClaimCallData,
        address _secondaryChainGateway,
        bytes32 _canonicalTxHash,
        bytes32 _l2TxHash,
        bytes calldata _forwardParams
    ) external payable nonReentrant {
        // Send l2 tx hash to secondary chain by gateway
        bytes[] memory gatewayDataList = new bytes[](1);
        bytes memory callData = abi.encodeCall(IZkLink.syncL2TxHash, (_canonicalTxHash, _l2TxHash));
        gatewayDataList[0] = abi.encode(_secondaryChainGateway, 0, callData);

        ARBITRATOR.claimMessage{value: msg.value}(
            _sourceChainCanonicalMessageService,
            _sourceChainClaimCallData,
            ARBITRATOR.primaryChainGateway(),
            0,
            abi.encode(gatewayDataList),
            _forwardParams
        );
    }
}
