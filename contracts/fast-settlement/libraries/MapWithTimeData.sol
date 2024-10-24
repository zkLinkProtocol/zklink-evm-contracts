// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {EnumerableMapUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableMapUpgradeable.sol";

library MapWithTimeData {
    using EnumerableMapUpgradeable for EnumerableMapUpgradeable.AddressToUintMap;

    error AlreadyAdded();
    error NotEnabled();
    error AlreadyEnabled();

    uint256 private constant ENABLED_TIME_MASK = 0xFFFFFFFFFFFFFFFFFFFFFFFF;
    uint256 private constant DISABLED_TIME_MASK = 0xFFFFFFFFFFFFFFFFFFFFFFFF << 48;

    function add(EnumerableMapUpgradeable.AddressToUintMap storage self, address addr) internal {
        if (!self.set(addr, uint256(0))) {
            revert AlreadyAdded();
        }
    }

    function disable(EnumerableMapUpgradeable.AddressToUintMap storage self, address addr) internal {
        uint256 value = self.get(addr);

        if (uint48(value) == 0 || uint48(value >> 48) != 0) {
            revert NotEnabled();
        }

        value |= uint256(block.timestamp) << 48;
        self.set(addr, value);
    }

    function enable(EnumerableMapUpgradeable.AddressToUintMap storage self, address addr) internal {
        uint256 value = self.get(addr);

        if (uint48(value) != 0 && uint48(value >> 48) == 0) {
            revert AlreadyEnabled();
        }

        value = uint256(block.timestamp);
        self.set(addr, value);
    }

    function atWithTimes(
        EnumerableMapUpgradeable.AddressToUintMap storage self,
        uint256 idx
    ) internal view returns (address key, uint48 enabledTime, uint48 disabledTime) {
        uint256 value;
        (key, value) = self.at(idx);
        enabledTime = uint48(value);
        disabledTime = uint48(value >> 48);
    }

    function getTimes(
        EnumerableMapUpgradeable.AddressToUintMap storage self,
        address addr
    ) internal view returns (uint48 enabledTime, uint48 disabledTime) {
        uint256 value = self.get(addr);
        enabledTime = uint48(value);
        disabledTime = uint48(value >> 48);
    }
}
