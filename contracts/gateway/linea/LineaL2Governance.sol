// SPDX-License-Identifier: MIT OR Apache-2.0

pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {IMessageService} from "../../interfaces/linea/IMessageService.sol";

contract LineaL2Governance is Ownable {
    /// @notice Linea message service on local chain
    IMessageService public immutable MESSAGE_SERVICE;

    /// @dev Represents a call to be made during an operation.
    /// @param target The address to which the call will be made.
    /// @param value The amount of Ether (in wei) to be sent along with the call.
    /// @param data The calldata to be executed on the `target` address.
    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    constructor(IMessageService _messageService, address _owner) {
        MESSAGE_SERVICE = _messageService;
        _transferOwnership(_owner);
    }

    /**
     * @dev Throws if the sender is not the Governance on Ethereum.
     */
    function _checkOwner() internal view override {
        require(
            _msgSender() == address(MESSAGE_SERVICE) && owner() == MESSAGE_SERVICE.sender(),
            "Ownable: caller is not the owner"
        );
    }

    /// @notice Executes the operation's calls from the Governance contract on Ethereum.
    /// @param _calls The array of calls to be executed.
    function execute(Call[] calldata _calls) external payable onlyOwner {
        for (uint256 i = 0; i < _calls.length; ++i) {
            Call memory _call = _calls[i];
            // No use of return value
            Address.functionCallWithValue(_call.target, _call.data, _call.value);
        }
    }

    /// @dev Contract might receive/hold ETH as part of the maintenance process.
    receive() external payable {
        // nothing to do here
    }
}
