// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ITokenPriceOracle} from "../interfaces/ITokenPriceOracle.sol";
import {IPyth} from "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import {PythStructs} from "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

contract TokenPriceOracle is ITokenPriceOracle, AccessControlUpgradeable, UUPSUpgradeable {
    struct TokenInfo {
        bytes32 priceId;
        uint8 decimals;
        uint248 defaultPrice;
    }

    bytes32 public constant TOKEN_PRICE_SET_ROLE = keccak256("TOKEN_PRICE_SET_ROLE");
    uint256 public constant USD_DECIMALS = 6;

    // @notice The pyth oracle for querying token price
    IPyth public immutable PYTH;

    // @notice Mapping from token address to token price info
    mapping(address => TokenInfo) public tokenInfos;
    // @notice The price age should be smaller than this period
    uint256 public validTimePeriod;

    event ValidTimePeriodUpdate(uint256 validTimePeriod);
    event NewTokenInfo(address indexed token, bytes32 priceId, uint8 decimals, uint248 defaultPrice);
    event NewTokenPriceId(address indexed token, bytes32 priceId);
    event NewTokenPrice(address indexed token, uint248 defaultPrice);

    constructor(IPyth _pyth) {
        PYTH = _pyth;
        _disableInitializers();
    }

    function initialize(address _admin, address _tokenPriceUpdater, uint256 _validTimePeriod) external initializer {
        __AccessControl_init_unchained();
        __UUPSUpgradeable_init_unchained();

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(TOKEN_PRICE_SET_ROLE, _tokenPriceUpdater);

        validTimePeriod = _validTimePeriod;
        emit ValidTimePeriodUpdate(_validTimePeriod);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {
        // can only call by owner
    }

    function setValidTimePeriod(uint256 _validTimePeriod) external onlyRole(DEFAULT_ADMIN_ROLE) {
        validTimePeriod = _validTimePeriod;
        emit ValidTimePeriodUpdate(_validTimePeriod);
    }

    /// @param _token The token address.
    /// @param _info The token info to query from external oracle.
    function addToken(address _token, TokenInfo calldata _info) external onlyRole(DEFAULT_ADMIN_ROLE) {
        // Allow price id to be 0 when token price can not be obtained from pyth.
        require(_info.decimals > 0, "Invalid decimals");
        require(_info.defaultPrice > 0, "Invalid price");
        tokenInfos[_token] = _info;
        emit NewTokenInfo(_token, _info.priceId, _info.decimals, _info.defaultPrice);
    }

    // @notice Set the token price id if pyth support
    function updateTokenPriceId(address _token, bytes32 _priceId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_priceId != bytes32(0), "Invalid price id");
        tokenInfos[_token].priceId = _priceId;
        emit NewTokenPriceId(_token, _priceId);
    }

    // @notice Set the token price if pyth not support
    /// @param _token The token address.
    /// @param _price The USD price of token in token decimals multiple by 10^18.
    /// @dev Suppose one token price is 200 USD and decimals is 10, then the price should be 200 * 10^6 * 10^18 / 10^10
    function updateTokenDefaultPrice(address _token, uint248 _price) external onlyRole(TOKEN_PRICE_SET_ROLE) {
        require(_price > 0, "Invalid price");
        tokenInfos[_token].defaultPrice = _price;
        emit NewTokenPrice(_token, _price);
    }

    // @dev Return the default token price if pyth not support
    function getTokenPrice(address _token) external view returns (uint256) {
        TokenInfo memory tokenInfo = tokenInfos[_token];
        if (tokenInfo.priceId != bytes32(0)) {
            PythStructs.Price memory pythPrice = PYTH.getPriceNoOlderThan(tokenInfo.priceId, validTimePeriod);
            return 10 ** (USD_DECIMALS + 18) * uint(uint64(pythPrice.price)) / (10 ** (uint8(uint32(-1 * pythPrice.expo)) + tokenInfo.decimals));
        } else {
            require(tokenInfo.defaultPrice > 0, "No default price");
            return tokenInfo.defaultPrice;
        }
    }
}
