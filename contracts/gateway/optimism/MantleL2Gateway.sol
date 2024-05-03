// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

import {OptimismL2Gateway} from "./OptimismL2Gateway.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MantleL2Gateway is OptimismL2Gateway {
    using SafeERC20 for IERC20;

    /// @dev The ETH token deployed on Mantle
    IERC20 private constant BVM_ETH = IERC20(0xdEAddEaDdeadDEadDEADDEAddEADDEAddead1111);

    constructor(address _zkLink) OptimismL2Gateway(_zkLink) {
        _disableInitializers();
    }

    function isEthGasToken() external pure override returns (bool) {
        return false;
    }

    function ethToken() external pure override returns (IERC20) {
        return BVM_ETH;
    }

    function claimMessageCallback(
        uint256 _ethValue,
        bytes calldata _callData
    ) external payable override onlyMessageService onlyRemoteGateway {
        if (_ethValue > 0) {
            // Mantle L2CrossDomainMessenger will approve l2 gateway before the callback in `relayMessage`
            SafeERC20.safeTransferFrom(BVM_ETH, address(MESSAGE_SERVICE), address(ZKLINK), _ethValue);
        }
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = ZKLINK.call{value: 0}(_callData);
        require(success, "Call zkLink failed");
    }
}
