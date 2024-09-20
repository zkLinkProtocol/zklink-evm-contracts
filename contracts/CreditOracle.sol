// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ICreditOracle} from "./interfaces/ICreditOracle.sol";
import {IL2Bridge} from "./zksync/l1-contracts/bridge/interfaces/IL2Bridge.sol";
import {AddressAliasHelper} from "./zksync/l1-contracts/vendor/AddressAliasHelper.sol";

contract CreditOracle is ICreditOracle, OwnableUpgradeable {
    address l1ERC20Bridge;

    constructor(address _l1ERC20Bridge) {
        l1ERC20Bridge = _l1ERC20Bridge;
        _disableInitializers();
    }

    function initialize() external initializer {
        __Ownable_init_unchained();
    }

    function setL1ERC20Bridge(address _l1ERC20Bridge) external onlyOwner {
        l1ERC20Bridge = _l1ERC20Bridge;
    }

    /// @dev Return the price of ETH in wei
    function getETHPrice() public pure returns (uint256) {
        return 2357 ether;
    }

    /// @dev Return the price of ERC20 token in wei
    function ERC20Price(address _token) public pure returns (uint256) {
        return 10;
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
    ) external view returns (uint256) {
        if (_l2Sender != AddressAliasHelper.applyL1ToL2Alias(l1ERC20Bridge)) {
            return 0;
        }
        uint256 credit = _l2Value * getETHPrice();
        bytes4 selector = bytes4(_l2CallData);
        if (selector == IL2Bridge.finalizeDepositToMerge.selector) {
            (, , address l1Token, uint256 amount, ) = abi.decode(
                _l2CallData[4:],
                (address, address, address, uint256, bytes)
            );
            credit = amount * ERC20Price(l1Token);
        } else if (selector == IL2Bridge.finalizeDeposit.selector) {
            (, , address l1Token, uint256 amount, ) = abi.decode(
                _l2CallData[4:],
                (address, address, address, uint256, bytes)
            );
            credit = amount * ERC20Price(l1Token);
        } else {
            return 0;
        }
        return credit;
    }
}
