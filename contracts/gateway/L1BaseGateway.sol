// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IArbitrator} from "../interfaces/IArbitrator.sol";
import {IL1Gateway} from "../interfaces/IL1Gateway.sol";

abstract contract L1BaseGateway is IL1Gateway {
    /// @notice The arbitrator to confirm synchronization
    IArbitrator public immutable ARBITRATOR;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;

    /// @dev Modifier to make sure the caller is the known arbitrator.
    modifier onlyArbitrator() {
        require(msg.sender == address(ARBITRATOR), "Not arbitrator");
        _;
    }

    constructor(IArbitrator _arbitrator) {
        ARBITRATOR = _arbitrator;
    }
}
