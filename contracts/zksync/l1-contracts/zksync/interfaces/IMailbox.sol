// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {L2Message} from "../Storage.sol";

/// @dev The enum that represents the transaction execution status
/// @param Failure The transaction execution failed
/// @param Success The transaction execution succeeded
enum TxStatus {
    Failure,
    Success
}

/// @title The interface of the zkSync Mailbox contract that provides interfaces for L1 <-> L2 interaction.
/// @author Matter Labs
/// @custom:security-contact security@matterlabs.dev
interface IMailbox {
    /// @dev Structure that includes all fields of the L2 transaction
    /// @dev The hash of this structure is the "canonical L2 transaction hash" and can be used as a unique identifier of a tx
    /// @param txType The tx type number, depending on which the L2 transaction can be interpreted differently
    /// @param from The sender's address. `uint256` type for possible address format changes and maintaining backward compatibility
    /// @param to The recipient's address. `uint256` type for possible address format changes and maintaining backward compatibility
    /// @param gasLimit The L2 gas limit for L2 transaction. Analog to the `gasLimit` on an L1 transactions
    /// @param gasPerPubdataByteLimit Maximum number of L2 gas that will cost one byte of pubdata (every piece of data that will be stored on L1 as calldata)
    /// @param maxFeePerGas The absolute maximum sender willing to pay per unit of L2 gas to get the transaction included in a batch. Analog to the EIP-1559 `maxFeePerGas` on an L1 transactions
    /// @param maxPriorityFeePerGas The additional fee that is paid directly to the validator to incentivize them to include the transaction in a batch. Analog to the EIP-1559 `maxPriorityFeePerGas` on an L1 transactions
    /// @param paymaster The address of the EIP-4337 paymaster, that will pay fees for the transaction. `uint256` type for possible address format changes and maintaining backward compatibility
    /// @param nonce The nonce of the transaction. For L1->L2 transactions it is the priority operation Id.
    /// @param value The value to pass with the transaction
    /// @param reserved The fixed-length fields for usage in a future extension of transaction formats
    /// @param data The calldata that is transmitted for the transaction call
    /// @param signature An abstract set of bytes that are used for transaction authorization
    /// @param factoryDeps The set of L2 bytecode hashes whose preimages were shown on L1
    /// @param paymasterInput The arbitrary-length data that is used as a calldata to the paymaster pre-call
    /// @param reservedDynamic The arbitrary-length field for usage in a future extension of transaction formats
    struct L2CanonicalTransaction {
        uint256 txType;
        uint256 from;
        uint256 to;
        uint256 gasLimit;
        uint256 gasPerPubdataByteLimit;
        uint256 maxFeePerGas;
        uint256 maxPriorityFeePerGas;
        uint256 paymaster;
        uint256 nonce;
        uint256 value;
        // In the future, we might want to add some
        // new fields to the struct. The `txData` struct
        // is to be passed to account and any changes to its structure
        // would mean a breaking change to these accounts. To prevent this,
        // we should keep some fields as "reserved".
        // It is also recommended that their length is fixed, since
        // it would allow easier proof integration (in case we will need
        // some special circuit for preprocessing transactions).
        uint256[4] reserved;
        bytes data;
        bytes signature;
        uint256[] factoryDeps;
        bytes paymasterInput;
        // Reserved dynamic type for the future use-case. Using it should be avoided,
        // But it is still here, just in case we want to enable some additional functionality.
        bytes reservedDynamic;
    }

    /// @dev Internal structure that contains the parameters for the forwardRequestL2Transaction
    /// @param gateway The secondary chain gateway;
    /// @param isContractCall It's true when the request come from a contract.
    /// @param sender The sender's address.
    /// @param txId The id of the priority transaction.
    /// @param contractAddressL2 The address of the contract on L2 to call.
    /// @param l2Value The msg.value of the L2 transaction.
    /// @param l2CallData The call data of the L2 transaction.
    /// @param l2GasLimit The limit of the L2 gas for the L2 transaction
    /// @param l2GasPrice The price of the L2 gas in Wei to be used for this transaction.
    /// @param l2GasPricePerPubdata The price for a single pubdata byte in L2 gas.
    /// @param refundRecipient The recipient of the refund for the transaction on L2. If the transaction fails, then
    /// this address will receive the `l2Value`.
    struct ForwardL2Request {
        address gateway;
        bool isContractCall;
        address sender;
        uint256 txId;
        address contractAddressL2;
        uint256 l2Value;
        bytes l2CallData;
        uint256 l2GasLimit;
        uint256 l2GasPricePerPubdata;
        bytes[] factoryDeps;
        address refundRecipient;
    }

    /// @notice Prove that a specific arbitrary-length message was sent in a specific L2 batch number
    /// @param _l2BatchNumber The executed L2 batch number in which the message appeared
    /// @param _index The position in the L2 logs Merkle tree of the l2Log that was sent with the message
    /// @param _message Information about the sent message: sender address, the message itself, tx index in the L2 batch where the message was sent
    /// @param _proof Merkle proof for inclusion of L2 log that was sent with the message
    /// @return Whether the proof is valid
    function proveL2MessageInclusion(
        uint256 _l2BatchNumber,
        uint256 _index,
        L2Message calldata _message,
        bytes32[] calldata _proof
    ) external view returns (bool);

    /// @notice Prove that the L1 -> L2 transaction was processed with the specified status.
    /// @param _l2TxHash The L2 canonical transaction hash
    /// @param _l2BatchNumber The L2 batch number where the transaction was processed
    /// @param _l2MessageIndex The position in the L2 logs Merkle tree of the l2Log that was sent with the message
    /// @param _l2TxNumberInBatch The L2 transaction number in the batch, in which the log was sent
    /// @param _merkleProof The Merkle proof of the processing L1 -> L2 transaction
    /// @param _status The execution status of the L1 -> L2 transaction (true - success & 0 - fail)
    /// @return Whether the proof is correct and the transaction was actually executed with provided status
    /// NOTE: It may return `false` for incorrect proof, but it doesn't mean that the L1 -> L2 transaction has an opposite status!
    function proveL1ToL2TransactionStatus(
        bytes32 _l2TxHash,
        uint256 _l2BatchNumber,
        uint256 _l2MessageIndex,
        uint16 _l2TxNumberInBatch,
        bytes32[] calldata _merkleProof,
        TxStatus _status
    ) external view returns (bool);

    /// @notice Request execution of L2 transaction from L1.
    /// @param _contractL2 The L2 receiver address
    /// @param _l2Value `msg.value` of L2 transaction
    /// @param _calldata The input of the L2 transaction
    /// @param _l2GasLimit Maximum amount of L2 gas that transaction can consume during execution on L2
    /// @param _l2GasPerPubdataByteLimit The maximum amount L2 gas that the operator may charge the user for single byte of pubdata.
    /// @param _factoryDeps An array of L2 bytecodes that will be marked as known on L2
    /// @param _refundRecipient The address on L2 that will receive the refund for the transaction.
    /// @dev If the L2 deposit finalization transaction fails, the `_refundRecipient` will receive the `_l2Value`.
    /// Please note, the contract may change the refund recipient's address to eliminate sending funds to addresses out of control.
    /// - If `_refundRecipient` is a contract on L1, the refund will be sent to the aliased `_refundRecipient`.
    /// - If `_refundRecipient` is set to `address(0)` and the sender has NO deployed bytecode on L1, the refund will be sent to the `msg.sender` address.
    /// - If `_refundRecipient` is set to `address(0)` and the sender has deployed bytecode on L1, the refund will be sent to the aliased `msg.sender` address.
    /// @dev The address aliasing of L1 contracts as refund recipient on L2 is necessary to guarantee that the funds are controllable,
    /// since address aliasing to the from address for the L2 tx will be applied if the L1 `msg.sender` is a contract.
    /// Without address aliasing for L1 contracts as refund recipients they would not be able to make proper L2 tx requests
    /// through the Mailbox to use or withdraw the funds from L2, and the funds would be lost.
    /// @return canonicalTxHash The hash of the requested L2 transaction. This hash can be used to follow the transaction status
    function requestL2Transaction(
        address _contractL2,
        uint256 _l2Value,
        bytes calldata _calldata,
        uint256 _l2GasLimit,
        uint256 _l2GasPerPubdataByteLimit,
        bytes[] calldata _factoryDeps,
        address _refundRecipient
    ) external payable returns (bytes32 canonicalTxHash);

    /// @notice Estimates the cost in Ether of requesting execution of an L2 transaction from L1
    /// @param _gasPrice expected L1 gas price at which the user requests the transaction execution
    /// @param _l2GasLimit Maximum amount of L2 gas that transaction can consume during execution on L2
    /// @param _l2GasPerPubdataByteLimit The maximum amount of L2 gas that the operator may charge the user for a single byte of pubdata.
    /// @return The estimated ETH spent on L2 gas for the transaction
    function l2TransactionBaseCost(
        uint256 _gasPrice,
        uint256 _l2GasLimit,
        uint256 _l2GasPerPubdataByteLimit
    ) external view returns (uint256);
}
