// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {IArbitrator} from "../../interfaces/IArbitrator.sol";
import {L2BaseGateway} from "../L2BaseGateway.sol";
import {L1BaseGateway} from "../L1BaseGateway.sol";

contract EthereumGateway is L1BaseGateway, L2BaseGateway, OwnableUpgradeable, ReentrancyGuardUpgradeable {

    function initialize(IArbitrator _arbitrator, address _zkLink) external initializer {
        __L1BaseGateway_init(_arbitrator);
        __L2BaseGateway_init(_zkLink);

        __Ownable_init();
        __ReentrancyGuard_init();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function getRemoteGateway() external view returns (address) {
        return address(0);
    }

    function sendMessage(uint256 _value, bytes memory _callData, bytes memory) external payable onlyArbitrator {
        require(msg.value == _value, "Invalid value from canonical message service");

        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = zkLink.call{value: _value}(_callData);
        require(success, "Call zkLink failed");
    }

    function sendMessage(uint256 _value, bytes memory _callData) external payable override onlyZkLink {
        require(msg.value == _value, "Invalid value from canonical message service");
        // Forward message to arbitrator
        arbitrator.receiveMessage{value: _value}(_value, _callData);
    }
}
