// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IL2Gateway} from "../interfaces/IL2Gateway.sol";

abstract contract L2BaseGateway is IL2Gateway {
    /// @notice The zkLink contract
    address public immutable ZKLINK;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;

    /// @dev Ensure withdraw come from zkLink
    modifier onlyZkLink() {
        require(msg.sender == ZKLINK, "Not zkLink contract");
        _;
    }

    constructor(address _zkLink) {
        ZKLINK = _zkLink;
    }
}
