// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IScrollMessenger} from "../../interfaces/scroll/IScrollMessenger.sol";
import {IMessageClaimer} from "../../interfaces/IMessageClaimer.sol";
import {BaseGateway} from "../BaseGateway.sol";

abstract contract ScrollGateway is BaseGateway, IMessageClaimer {
    /// @notice Scroll message service on local chain
    IScrollMessenger public immutable MESSAGE_SERVICE;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;

    /// @dev Modifier to make sure the caller is the known message service.
    modifier onlyMessageService() {
        require(msg.sender == address(MESSAGE_SERVICE), "Not message service");
        _;
    }

    /// @dev Modifier to make sure the original sender is gateway on remote chain.
    modifier onlyRemoteGateway() {
        require(MESSAGE_SERVICE.xDomainMessageSender() == remoteGateway, "Not remote gateway");
        _;
    }

    constructor(IScrollMessenger _messageService) {
        MESSAGE_SERVICE = _messageService;
    }

    function __ScrollGateway_init() internal onlyInitializing {
        __BaseGateway_init();
    }
}
