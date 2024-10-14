// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ICreditOracle} from "../interfaces/ICreditOracle.sol";
import {ITokenPriceOracle} from "../interfaces/ITokenPriceOracle.sol";
import {IL2Bridge} from "../zksync/l1-contracts/bridge/interfaces/IL2Bridge.sol";

contract CreditOracle is ICreditOracle, OwnableUpgradeable, UUPSUpgradeable {
    address public constant ETH_TOKEN_ADDRESS = address(1);
    // @notice The alias address of L1_ERC20_BRIDGE
    address public immutable L1_ERC20_BRIDGE_ALIAS;
    // @notice The token price oracle
    ITokenPriceOracle public immutable TOKEN_PRICE_ORACLE;
    // @notice The risk multiplier is used to calculate credit for all tokens if it's not set in tokenRiskMultiplier
    uint256 public riskMultiplier;
    // @notice The token risk multiplier will override the riskMultiplier if it's set
    mapping(address => uint256) public tokenRiskMultiplier;

    event RiskMultiplierUpdate(uint256 riskMultiplier);
    event TokenRiskMultiplierUpdate(address indexed token, uint256 riskMultiplier);

    constructor(address _l1ERC20BridgeAlias, ITokenPriceOracle _tokenPriceOracle) {
        L1_ERC20_BRIDGE_ALIAS = _l1ERC20BridgeAlias;
        TOKEN_PRICE_ORACLE = _tokenPriceOracle;
        _disableInitializers();
    }

    function initialize() external initializer {
        __Ownable_init_unchained();
        __UUPSUpgradeable_init_unchained();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        // can only call by owner
    }

    function getCredit(
        address _l2Sender,
        address,
        uint256 _l2Value,
        bytes calldata _l2CallData
    ) public view returns (uint256) {
        uint256 credit = 0;
        if (_l2Value > 0) {
            uint256 ethPrice = TOKEN_PRICE_ORACLE.getTokenPrice(ETH_TOKEN_ADDRESS);
            uint256 _riskMultiplier = getTokenRiskMultiplier(ETH_TOKEN_ADDRESS);
            credit = _l2Value * ethPrice * _riskMultiplier;
        }
        if (_l2Sender == L1_ERC20_BRIDGE_ALIAS) {
            uint256 tokenCredit = getTokenCredit(_l2CallData);
            credit += tokenCredit;
        }
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
            uint256 tokenPrice = TOKEN_PRICE_ORACLE.getTokenPrice(l1Token);
            uint256 _riskMultiplier = getTokenRiskMultiplier(l1Token);
            credit = amount * tokenPrice * _riskMultiplier;
        }
        return credit;
    }

    // @notice Return the risk multiplier for token
    // @dev The risk multiplier will not be less than 1
    function getTokenRiskMultiplier(address _token) public view returns (uint256) {
        uint256 risk = tokenRiskMultiplier[_token];
        return risk > 0 ? risk : riskMultiplier > 0 ? riskMultiplier : 1;
    }

    function setRiskMultiplier(uint256 _riskMultiplier) external onlyOwner {
        require(_riskMultiplier > 0, "Invalid risk multiplier");
        riskMultiplier = _riskMultiplier;
        emit RiskMultiplierUpdate(_riskMultiplier);
    }

    function setTokenRiskMultiplier(address _token, uint256 _riskMultiplier) external onlyOwner {
        require(_riskMultiplier > 0, "Invalid risk multiplier");
        tokenRiskMultiplier[_token] = _riskMultiplier;
        emit TokenRiskMultiplierUpdate(_token, _riskMultiplier);
    }
}
