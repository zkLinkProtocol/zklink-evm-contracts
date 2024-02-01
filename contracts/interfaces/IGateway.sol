// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

interface IGateway {
    /// @return Remote gateway
    function getRemoteGateway() external view returns (address);
}
