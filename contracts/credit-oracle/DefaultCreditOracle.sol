// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ICreditOracle} from "../interfaces/ICreditOracle.sol";
import {IL2Bridge} from "../zksync/l1-contracts/bridge/interfaces/IL2Bridge.sol";
import {AddressAliasHelper} from "../zksync/l1-contracts/vendor/AddressAliasHelper.sol";

contract DefaultCreditOracle is ICreditOracle, Ownable {
    address immutable l1ERC20Bridge;
    // The decimal of base token (USD)
    uint8 constant BASE_TOKEN_DECIMALs = 6;
    // The decimal of ETH
    uint8 constant ETH_DECIMALs = 18;
    uint8 constant EXPANDED_PRECISION_DECIMALS = 18;
    // mapping from token address to token price in their decimal multipled by 10^18
    mapping(address => uint256) public tokenPrices;
    // ETH price in wei multiplied by 10^18
    uint256 public ethPrice;

    constructor(address _l1ERC20Bridge) Ownable() {
        l1ERC20Bridge = _l1ERC20Bridge;
    }

    /// @return The price of ETH in wei multiplied by 10^18.
    function getEthPrice() public view returns (uint256) {
        return ethPrice;
    }

    /// @return The price of ERC20 token its decimals multiplied by 10^18.
    function getTokenPrice(address _token) public view returns (uint256) {
        return tokenPrices[_token];
    }

    /// @param price The USD price of ETH in wei multiple by 10^18.
    /// @notice Suppose one ETH price is 2000 USDT, then the input price should be 2000 * 10^6 / 10^18 * 10^18
    function setEthPrice(uint256 price) external onlyOwner {
        ethPrice = price;
    }

    /// @param price The USD price of ERC20 token in token decimals multiple bye 10^18.
    /// @notice Suppose one token price is 200 USDT and decimals is 10, then the input price should be 200 * 10^6 / 10^10 * 10^18
    function setTokenInfo(address _token, uint256 price) external onlyOwner {
        tokenPrices[_token] = price;
    }

    /// @notice Return the credit consumed by l2 request
    /// @param _l2Sender The msg sender of l2
    /// @param _l2To The to of l2
    /// @param _l2Value The msg value of l2
    /// @param _l2CallData The msg calldata of l2
    function getCredit(
        address _l2Sender,
        address _l2To,
        uint256 _l2Value,
        bytes calldata _l2CallData
    ) public view returns (uint256) {
        require(ethPrice > 0, "ETH price not set");
        // ETH Credit = ethPrice * 10^6 * value / 10^18 * 10^18
        uint256 credit = _l2Value * getEthPrice();
        if (_l2Sender == AddressAliasHelper.applyL1ToL2Alias(l1ERC20Bridge)) {
            uint256 tokenCredit = getTokenCredit(_l2CallData);
            credit += tokenCredit;
        }
        // Convert to price in base token
        credit /= 10 ** BASE_TOKEN_DECIMALs;
        return credit;
    }

    function getTokenCredit(bytes calldata _l2CallData) internal view returns (uint256) {
        uint256 credit = 0;
        bytes4 selector = bytes4(_l2CallData);
        if (selector == IL2Bridge.finalizeDepositToMerge.selector || selector == IL2Bridge.finalizeDeposit.selector) {
            (, , address l1Token, uint256 amount, ) = abi.decode(
                _l2CallData[4:],
                (address, address, address, uint256, bytes)
            );
            // Token Credit = tokenPrice * 10^6 * amount / 10^tokenDecimal * 10^18
            uint256 tokenPrice = getTokenPrice(l1Token);
            require(tokenPrice > 0, "Token price not set");
            credit = amount * tokenPrice;
        }
        return credit;
    }
}
