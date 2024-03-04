// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
 * @author Matter Labs
 * @custom:security-contact security@matterlabs.dev
 * @dev The library provides a set of functions that help read data from an "abi.encodePacked" byte array.
 * @dev Each of the functions accepts the `bytes memory` and the offset where data should be read and returns a value of a certain type.
 *
 * @dev WARNING!
 * 1) Functions don't check the length of the bytes array, so it can go out of bounds.
 * The user of the library must check for bytes length before using any functions from the library!
 *
 * 2) Read variables are not cleaned up - https://docs.soliditylang.org/en/v0.8.16/internals/variable_cleanup.html.
 * Using data in inline assembly can lead to unexpected behavior!
 */
library UnsafeBytes {
    function readUint32(bytes memory _bytes, uint256 _start) internal pure returns (uint32 result, uint256 offset) {
        assembly {
            offset := add(_start, 4)
            result := mload(add(_bytes, offset))
        }
    }

    function readAddress(bytes memory _bytes, uint256 _start) internal pure returns (address result, uint256 offset) {
        assembly {
            offset := add(_start, 20)
            result := mload(add(_bytes, offset))
        }
    }

    function readUint256(bytes memory _bytes, uint256 _start) internal pure returns (uint256 result, uint256 offset) {
        assembly {
            offset := add(_start, 32)
            result := mload(add(_bytes, offset))
        }
    }

    function readBytes32(bytes memory _bytes, uint256 _start) internal pure returns (bytes32 result, uint256 offset) {
        assembly {
            offset := add(_start, 32)
            result := mload(add(_bytes, offset))
        }
    }

    // Original source code: https://github.com/GNSPS/solidity-bytes-utils/blob/master/contracts/BytesLib.sol#L228
    // Get slice from bytes arrays
    // Returns the newly created 'bytes memory'
    // NOTE: theoretically possible overflow of (_start + _length)
    function slice(bytes memory _bytes, uint256 _start, uint256 _length) internal pure returns (bytes memory) {
        require(_bytes.length >= (_start + _length), "Z"); // bytes length is less then start byte + length bytes

        bytes memory tempBytes = new bytes(_length);

        if (_length != 0) {
            assembly {
                let slice_curr := add(tempBytes, 0x20)
                let slice_end := add(slice_curr, _length)

                for {
                    let array_current := add(_bytes, add(_start, 0x20))
                } lt(slice_curr, slice_end) {
                    slice_curr := add(slice_curr, 0x20)
                    array_current := add(array_current, 0x20)
                } {
                    mstore(slice_curr, mload(array_current))
                }
            }
        }

        return tempBytes;
    }
}
