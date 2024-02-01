// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {IMessageService} from "../../interfaces/linea/IMessageService.sol";
import {BaseGateway} from "../BaseGateway.sol";
import {ILineaGateway} from "../../interfaces/linea/ILineaGateway.sol";

abstract contract LineaGateway is BaseGateway, ILineaGateway {
    /// @notice Linea message service on local chain
    IMessageService public messageService;

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

    /// @dev Modifier to make sure the original sender is gateway on remote chain.
    modifier onlyRemoteGateway() {
        require(messageService.sender() == remoteGateway, "Not remote gateway");
        _;
    }

    function __LineaGateway_init(IMessageService _messageService) internal onlyInitializing {
        __BaseGateway_init();
        __LineaGateway_init_unchained(_messageService);
    }

    function __LineaGateway_init_unchained(IMessageService _messageService) internal onlyInitializing {
        messageService = _messageService;
    }

    function claimMessage(uint256 _value, bytes calldata _callData, uint256 _nonce) external nonReentrant {
        // `claimMessageCallback` will be called within `claimMessage`
        // no fee on remote chain
        messageService.claimMessage(remoteGateway, address(this), 0, _value, payable(msg.sender), _callData, _nonce);
    }
}
