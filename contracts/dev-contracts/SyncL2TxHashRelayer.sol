// SPDX-License-Identifier: MIT OR Apache-2.0

pragma solidity ^0.8.0;

import {IArbitrator} from "../interfaces/IArbitrator.sol";
import {IZkLink} from "../interfaces/IZkLink.sol";

contract SyncL2TxHashRelayer {
    /// @dev The address of the arbitrator contract
    IArbitrator public immutable ARBITRATOR;

    constructor(IArbitrator _arbitrator) {
        ARBITRATOR = _arbitrator;
    }

    function claimPrimaryChainSyncL2TxHashMessage(
        address _sourceChainCanonicalMessageService,
        bytes calldata _sourceChainClaimCallData,
        address _secondaryChainL1Gateway,
        bytes32 _secondaryChainL2TxHash,
        bytes32 _primaryChainL2TxHash,
        bytes calldata _forwardParams
    ) external payable {
        // Send l2 tx hash to secondary chain by gateway
        bytes[] memory gatewayDataList = new bytes[](1);
        bytes memory callData = abi.encodeCall(IZkLink.syncL2TxHash, (_secondaryChainL2TxHash, _primaryChainL2TxHash));
        gatewayDataList[0] = abi.encode(_secondaryChainL1Gateway, 0, callData);

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
