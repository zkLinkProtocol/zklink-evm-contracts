// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {FeeParams} from "../Storage.sol";
import {IL2Gateway} from "../../../../interfaces/IL2Gateway.sol";

/// @title The interface of the Admin Contract that controls access rights for contract management.
/// @author Matter Labs
/// @custom:security-contact security@matterlabs.dev
interface IAdmin {
    /// @notice Init gateway
    /// @param _gateway The gateway on local chain
    function setGateway(IL2Gateway _gateway) external;

    /// @notice Change validator status (active or not active)
    /// @param _validator Validator address
    /// @param _active Active flag
    function setValidator(address _validator, bool _active) external;

    /// @notice Change the fee params for L1->L2 transactions
    /// @param _newFeeParams The new fee params
    function changeFeeParams(FeeParams calldata _newFeeParams) external;
}
