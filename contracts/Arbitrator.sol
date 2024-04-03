// SPDX-License-Identifier: MIT OR Apache-2.0

pragma solidity ^0.8.0;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {DoubleEndedQueueUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/structs/DoubleEndedQueueUpgradeable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {IArbitrator} from "./interfaces/IArbitrator.sol";
import {IL1Gateway} from "./interfaces/IL1Gateway.sol";
import {IZkLink} from "./interfaces/IZkLink.sol";
import {IAdmin} from "./zksync/l1-contracts/zksync/interfaces/IAdmin.sol";
import {IZkSync} from "./zksync/l1-contracts/zksync/interfaces/IZkSync.sol";
import {FeeParams} from "./zksync/l1-contracts/zksync/Storage.sol";

/// @title Arbitrator contract
/// @author zk.link
contract Arbitrator is IArbitrator, OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable {
    using DoubleEndedQueueUpgradeable for DoubleEndedQueueUpgradeable.Bytes32Deque;

    struct GatewayAdapterParams {
        IL1Gateway gateway;
        bytes adapterParams;
    }

    /// @dev The gateway for sending message from ethereum to primary chain
    IL1Gateway public primaryChainGateway;
    /// @dev The gateway for sending message from ethereum to secondary chain
    mapping(IL1Gateway => bool) public secondaryChainGateways;
    /// @dev A message hash queue waiting to forward to all secondary chains
    DoubleEndedQueueUpgradeable.Bytes32Deque public primaryChainMessageHashQueue;
    /// @dev A message hash queue waiting to forward to primary chain
    mapping(IL1Gateway => DoubleEndedQueueUpgradeable.Bytes32Deque) public secondaryChainMessageHashQueues;
    /// @notice List of permitted relayers
    mapping(address relayerAddress => bool isRelayer) public relayers;
    /// @dev The forward params are used to forward a l2 message from source chain to target chains
    bytes private forwardParams;
    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;

    /// @notice Primary chain gateway init
    event InitPrimaryChain(IL1Gateway indexed gateway);
    /// @notice SecondaryChain's status changed
    event SecondaryChainStatusUpdate(IL1Gateway indexed gateway, bool isActive);
    /// @notice Relayer's status changed
    event RelayerStatusUpdate(address indexed relayer, bool isActive);
    /// @notice Validator's status changed
    event ValidatorStatusUpdate(IL1Gateway indexed gateway, address validatorAddress, bool isActive);
    /// @notice Fee params for L1->L2 transactions changed
    event NewFeeParams(IL1Gateway indexed gateway, FeeParams newFeeParams);
    /// @notice Emit when forward message to l1 gateway
    event MessageForwarded(IL1Gateway indexed gateway, uint256 value, bytes callData);

    /// @notice Checks if relayer is active
    modifier onlyRelayer() {
        require(relayers[msg.sender], "Not relayer"); // relayer is not active
        _;
    }

    constructor() {
        _disableInitializers();
    }

    function initialize() external initializer {
        __Ownable_init_unchained();
        __UUPSUpgradeable_init_unchained();
        __ReentrancyGuard_init_unchained();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        // can only call by owner
    }

    /// @notice Return the message hash at a position stored in queue
    function getMessageHash(IL1Gateway _gateway, uint256 _index) external view returns (bytes32 messageHash) {
        if (_gateway == primaryChainGateway) {
            messageHash = primaryChainMessageHashQueue.at(_index);
        } else {
            messageHash = secondaryChainMessageHashQueues[_gateway].at(_index);
        }
    }

    /// @dev Set primary chain
    function setPrimaryChainGateway(IL1Gateway _gateway) external onlyOwner {
        require(address(primaryChainGateway) == address(0), "Duplicate init gateway");
        require(address(_gateway) != address(0), "Invalid gateway");
        primaryChainGateway = _gateway;
        emit InitPrimaryChain(_gateway);
    }

    /// @dev Set secondary chain
    function setSecondaryChainGateway(
        IL1Gateway _gateway,
        bool _active,
        bytes calldata _adapterParams
    ) external payable onlyOwner {
        require(_gateway != primaryChainGateway, "Invalid gateway");
        if (_active != secondaryChainGateways[_gateway]) {
            secondaryChainGateways[_gateway] = _active;
            bytes memory callData = abi.encodeCall(IZkSync.setSecondaryChainGateway, (address(_gateway), _active));
            // Forward fee to send message
            primaryChainGateway.sendMessage{value: msg.value}(0, callData, _adapterParams);
            emit SecondaryChainStatusUpdate(_gateway, _active);
        }
    }

    /// @dev Set relayer
    function setRelayer(address _relayer, bool _active) external onlyOwner {
        if (relayers[_relayer] != _active) {
            relayers[_relayer] = _active;
            emit RelayerStatusUpdate(_relayer, _active);
        }
    }

    /// @dev Set validator for a chain
    function setValidator(
        IL1Gateway _gateway,
        address _validator,
        bool _active,
        bytes calldata _adapterParams
    ) external payable onlyOwner {
        require(_gateway == primaryChainGateway || secondaryChainGateways[_gateway], "Invalid gateway");
        bytes memory callData = abi.encodeCall(IAdmin.setValidator, (_validator, _active));
        // Forward fee to send message
        _gateway.sendMessage{value: msg.value}(0, callData, _adapterParams);
        emit ValidatorStatusUpdate(_gateway, _validator, _active);
    }

    /// @dev Change fee params for a chain
    function changeFeeParams(
        IL1Gateway _gateway,
        FeeParams calldata _newFeeParams,
        bytes calldata _adapterParams
    ) external payable onlyOwner {
        require(_gateway == primaryChainGateway || secondaryChainGateways[_gateway], "Invalid gateway");
        bytes memory callData = abi.encodeCall(IAdmin.changeFeeParams, (_newFeeParams));
        // Forward fee to send message
        _gateway.sendMessage{value: msg.value}(0, callData, _adapterParams);
        emit NewFeeParams(_gateway, _newFeeParams);
    }

    /// @dev This function is called within the `claimMessageCallback` of L1 gateway
    function receiveMessage(uint256 _value, bytes calldata _callData) external payable {
        require(msg.value == _value, "Invalid msg value");
        IL1Gateway gateway = IL1Gateway(msg.sender);
        // Ensure the caller is L1 gateway
        if (gateway == primaryChainGateway) {
            // Unpack destination chain and final callData
            bytes[] memory gatewayCallDataLists = abi.decode(_callData, (bytes[]));
            // `forwardParams` is set in `claimMessage`
            bytes[] memory gatewayForwardParams = abi.decode(forwardParams, (bytes[]));
            uint256 gatewayLength = gatewayCallDataLists.length;
            require(gatewayLength == gatewayForwardParams.length, "Invalid forward params length");
            unchecked {
                for (uint256 i = 0; i < gatewayLength; ++i) {
                    bytes memory gatewayCallData = gatewayCallDataLists[i];
                    bytes memory gatewayForwardParam = gatewayForwardParams[i];
                    (IL1Gateway secondaryChainGateway, uint256 callValue, bytes memory callData) = abi.decode(gatewayCallData, (IL1Gateway, uint256, bytes));
                    require(secondaryChainGateways[secondaryChainGateway], "Invalid secondary chain gateway");
                    (uint256 sendMsgFee, bytes memory adapterParams) = abi.decode(gatewayForwardParam, (uint256, bytes));
                    // Forward fee to send message
                    secondaryChainGateway.sendMessage{value: sendMsgFee + callValue}(callValue, callData, adapterParams);
                }
            }
        } else {
            require(secondaryChainGateways[gateway], "Not secondary chain gateway");
            // `forwardParams` is set in `claimMessage`
            (uint256 sendMsgFee, bytes memory adapterParams) = abi.decode(forwardParams, (uint256, bytes));
            // Forward fee to send message
            primaryChainGateway.sendMessage{value: sendMsgFee + _value}(_value, _callData, adapterParams);
        }
        emit MessageForwarded(gateway, _value, _callData);
    }

    function forwardMessage(
        IL1Gateway _gateway,
        uint256 _value,
        bytes calldata _callData,
        bytes calldata _adapterParams
    ) external payable nonReentrant onlyRelayer {
        bytes32 finalizeMessageHash = keccak256(abi.encode(_value, _callData));
        if (_gateway == primaryChainGateway) {
            require(finalizeMessageHash == primaryChainMessageHashQueue.popFront(), "Invalid finalize message hash");
            // Unpack destination chain and final callData
            (IL1Gateway secondaryChainGateway, bytes memory finalCallData) = abi.decode(_callData, (IL1Gateway, bytes));
            require(secondaryChainGateways[secondaryChainGateway], "Invalid secondary chain gateway");
            // Forward fee to send message
            secondaryChainGateway.sendMessage{value: msg.value + _value}(_value, finalCallData, _adapterParams);
        } else {
            require(secondaryChainGateways[_gateway], "Not secondary chain gateway");
            require(
                finalizeMessageHash == secondaryChainMessageHashQueues[_gateway].popFront(),
                "Invalid finalize message hash"
            );
            // Forward fee to send message
            primaryChainGateway.sendMessage{value: msg.value + _value}(_value, _callData, _adapterParams);
        }
        emit MessageForwarded(_gateway, _value, _callData);
    }

    function claimMessage(
        address _sourceChainCanonicalMessageService,
        bytes calldata _sourceChainClaimCallData,
        bytes memory _forwardParams
    ) external payable nonReentrant onlyRelayer {
        // The `forwardParams` will be cleared after tx executed
        assembly {
            tstore(forwardParams.slot, _forwardParams)
        }
        // Call the claim interface of source chain message service
        // And it will inner call the `claimCallback` interface of source chain L1Gateway
        // No use of return value
        Address.functionCall(_sourceChainCanonicalMessageService, _sourceChainClaimCallData);
    }
}
