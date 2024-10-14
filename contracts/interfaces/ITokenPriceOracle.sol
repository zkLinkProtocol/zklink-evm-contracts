// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

interface ITokenPriceOracle {
    /// @return Returns the price of the token, which is used to calculate collateral and credit. The price will improve accuracy.
    /// @param _token The token address
    function getTokenPrice(address _token) external view returns (uint256);
}
