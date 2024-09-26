// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ICreditOracle} from "../interfaces/ICreditOracle.sol";
import {IL2Bridge} from "../zksync/l1-contracts/bridge/interfaces/IL2Bridge.sol";
import {AddressAliasHelper} from "../zksync/l1-contracts/vendor/AddressAliasHelper.sol";

contract DefaultCreditOracle is ICreditOracle, Ownable {
    address public immutable L1_ERC20_BRIDGE;
    uint8 constant EXPANDED_PRECISION_DECIMALS = 18;
    // mapping from token address to token price in their decimal multipled by 10^18
    mapping(address => uint256) public tokenPrices;
    // ETH price in wei multiplied by 10^18
    uint256 public ethPrice;

    constructor(address _l1ERC20Bridge) Ownable() {
        L1_ERC20_BRIDGE = _l1ERC20Bridge;
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
        // ETH Credit = value * ethUnitPrice * 10^6 / 10^18 * 10^18
        uint256 credit = _l2Value * ethPrice;
        if (_l2Sender == AddressAliasHelper.applyL1ToL2Alias(L1_ERC20_BRIDGE)) {
            uint256 tokenCredit = getTokenCredit(_l2CallData);
            credit += tokenCredit;
        }
        // Convert to price in base token
        credit /= 10 ** EXPANDED_PRECISION_DECIMALS;
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
            // Token Credit = amount * tokenUnitPrice * 10^6 / 10^tokenDecimal * 10^18
            credit = amount * tokenPrices[l1Token];
        }
        return credit;
    }
}
