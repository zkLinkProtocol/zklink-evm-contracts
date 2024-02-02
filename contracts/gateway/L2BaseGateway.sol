// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IL2Gateway} from "../interfaces/IL2Gateway.sol";

abstract contract L2BaseGateway is IL2Gateway, UUPSUpgradeable {
    /// @notice The zkLink contract
    address public zkLink;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;

    /// @dev Ensure withdraw come from zkLink
    modifier onlyZkLink() {
        require(msg.sender == zkLink, "Not zkLink contract");
        _;
    }

    function __L2BaseGateway_init(address _zkLink) internal onlyInitializing {
        __UUPSUpgradeable_init();
        __L2BaseGateway_init_unchained(_zkLink);
    }

    function __L2BaseGateway_init_unchained(address _zkLink) internal onlyInitializing {
        zkLink = _zkLink;
    }
}
