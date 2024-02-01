// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IScrollMessenger} from "../../interfaces/scroll/IScrollMessenger.sol";
import {BaseGateway} from "../BaseGateway.sol";

abstract contract ScrollGateway is BaseGateway {
    /// @notice Linea message service on local chain
    IScrollMessenger public messageService;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;

    /// @dev Modifier to make sure the caller is the known message service.
    modifier onlyMessageService() {
        require(msg.sender == address(messageService), "Not message service");
        _;
    }

    function __ScrollGateway_init(IScrollMessenger _messageService) internal onlyInitializing {
        __BaseGateway_init();
        __ScrollGateway_init_unchained(_messageService);
    }

    function __ScrollGateway_init_unchained(IScrollMessenger _messageService) internal onlyInitializing {
        messageService = _messageService;
    }
}
