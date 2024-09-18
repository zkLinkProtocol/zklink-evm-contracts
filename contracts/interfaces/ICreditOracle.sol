// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

interface ICreditOracle {
    /// @return Return the credit consumed by l2 request
    /// @param _l2Sender The msg sender of l2
    /// @param _l2To The to of l2
    /// @param _l2Value The msg value of l2
    /// @param _l2CallData The msg calldata of l2
    function getCredit(address _l2Sender, address _l2To, uint256 _l2Value, bytes memory _l2CallData) external view returns (uint256);
}
