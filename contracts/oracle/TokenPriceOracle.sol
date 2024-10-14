// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ITokenPriceOracle} from "../interfaces/ITokenPriceOracle.sol";

contract TokenPriceOracle is ITokenPriceOracle, AccessControlUpgradeable, UUPSUpgradeable {
    bytes32 public constant TOKEN_PRICE_SET_ROLE = keccak256("TOKEN_PRICE_SET_ROLE");

    // @notice mapping from token address to token price in their decimal multiple by 10^18
    mapping(address => uint256) public tokenPrices;

    constructor() {
        _disableInitializers();
    }

    function initialize(address admin, address tokenPriceUpdater) external initializer {
        __AccessControl_init_unchained();
        __UUPSUpgradeable_init_unchained();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(TOKEN_PRICE_SET_ROLE, tokenPriceUpdater);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {
        // can only call by owner
    }

    /// @param _token The token address.
    /// @param _price The USD price of token in token decimals multiple by 10^18.
    /// @dev Suppose one token price is 200 USD and decimals is 10, then the price should be 200 * 10^6 * 10^18 / 10^10
    function setTokenPrice(address _token, uint256 _price) external onlyRole(TOKEN_PRICE_SET_ROLE) {
        tokenPrices[_token] = _price;
    }

    function getTokenPrice(address _token) external view returns (uint256) {
        return tokenPrices[_token];
    }
}
