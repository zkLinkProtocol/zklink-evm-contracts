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

    /// @dev Modifier to make sure the original sender is current contract.
    modifier onlyThis() {
        require(msg.sender == address(this), "Not this");
        _;
    }

    function __LineaGateway_init(IMessageService _messageService) internal onlyInitializing {
        __BaseGateway_init();
        __LineaGateway_init_unchained(_messageService);
    }

    function __LineaGateway_init_unchained(IMessageService _messageService) internal onlyInitializing {
        messageService = _messageService;
    }

    function claimMessage(uint256 _value, bytes calldata _callData, uint256 _nonce) external payable nonReentrant {
        // no fee on remote chain
        // `receiveEthCallback` will be called within `claimMessage`
        messageService.claimMessage(remoteGateway, address(this), 0, _value, payable(msg.sender), _callData, _nonce);

        // decode `_callData` to get message value and message call data after `receiveEthCallback` was called success
        (, uint256 msgValue, bytes memory msgCallData) = abi.decode(_callData, (bytes4, uint256, bytes));
        require(msgValue == _value, "Claim value not match");

        // forward relayer fee to callback
        this.claimMessageCallback{value: msg.value + msgValue}(msgValue, msgCallData);
    }

    function receiveEthCallback(uint256 _value, bytes calldata) external payable onlyMessageService onlyRemoteGateway {
        require(msg.value == _value, "Invalid value from canonical message service");
        // here we just receive eth from linea message service
    }

    /// @notice Claim message callback called by gateway
    /// @param _value The message value
    /// @param _callData The message data
    function claimMessageCallback(uint256 _value, bytes calldata _callData) external payable virtual;
}
