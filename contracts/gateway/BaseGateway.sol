// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {IGateway} from "../interfaces/IGateway.sol";

abstract contract BaseGateway is IGateway, OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable {
    /// @notice Gateway address on remote chain
    address internal remoteGateway;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;

    event SetRemoteGateway(address remoteGateWay);

    function __BaseGateway_init() internal onlyInitializing {
        __BaseGateway_init_unchained();
    }

    function __BaseGateway_init_unchained() internal onlyInitializing {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function getRemoteGateway() external view returns (address) {
        return remoteGateway;
    }

    /// @notice Set remote Gateway address
    /// @param _remoteGateway remote gateway address
    function setRemoteGateway(address _remoteGateway) external onlyOwner {
        remoteGateway = _remoteGateway;
        emit SetRemoteGateway(_remoteGateway);
    }
}
