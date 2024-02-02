// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/// @dev The L2 gasPricePerPubdata required to be used in bridges.
uint256 constant REQUIRED_L2_GAS_PRICE_PER_PUBDATA = 800;
/// @dev The number of pubdata an L1->L2 transaction requires with each new factory dependency
uint256 constant MAX_NEW_FACTORY_DEPS = 32;
/// @dev Even though the price for 1 byte of pubdata is 16 L1 gas, we have a slightly increased value.
uint256 constant L1_GAS_PER_PUBDATA_BYTE = 17;
/// @dev The value of default leaf hash for L2 -> L1 logs Merkle tree
/// @dev An incomplete fixed-size tree is filled with this value to be a full binary tree
/// @dev Actually equal to the `keccak256(new bytes(L2_TO_L1_LOG_SERIALIZE_SIZE))`
bytes32 constant L2_L1_LOGS_TREE_DEFAULT_LEAF_HASH = 0x72abee45b59e344af8a6e520241c4744aff26ed411f4c4b00f8af09adada43ba;
