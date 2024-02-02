// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

interface IZkPolygonGateway {
    function claimMessageCallback(uint256 _value, bytes memory _callData) external payable;
}
