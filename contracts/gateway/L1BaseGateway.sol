// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IArbitrator} from "../interfaces/IArbitrator.sol";

abstract contract L1BaseGateway is UUPSUpgradeable {
    /// @notice The arbitrator to confirm synchronization
    IArbitrator public arbitrator;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;

    /// @dev Modifier to make sure the caller is the known arbitrator.
    modifier onlyArbitrator() {
        require(msg.sender == address(arbitrator), "Not arbitrator");
        _;
    }

    function __L1BaseGateway_init(IArbitrator _arbitrator) internal onlyInitializing {
        __UUPSUpgradeable_init();
        __L1BaseGateway_init_unchained(_arbitrator);
    }

    function __L1BaseGateway_init_unchained(IArbitrator _arbitrator) internal onlyInitializing {
        arbitrator = _arbitrator;
    }

    function transferToArbitrator(uint256 _amount) external onlyArbitrator {
        (bool sent, ) = address(arbitrator).call{value: _amount}("");
        require(sent, "Failed to send Ether");
    }
}
