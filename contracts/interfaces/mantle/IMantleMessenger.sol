// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.0;

interface IMantleMessenger {
    /**
     * @notice Sends a message to some target address on the other chain. Note that if the call
     *         always reverts, then the message will be unrelayable, and any ETH sent will be
     *         permanently locked. The same will occur if the target on the other chain is
     *         considered unsafe (see the _isUnsafeTarget() function).
     *
     * @param _otherSideNativeTokenAmount   Bridge the other side native token amount.
     * @param _target                       Target contract or wallet address.
     * @param _message                      Message to trigger the target address with.
     * @param _minGasLimit                  Minimum gas limit that the message can be executed with.
     */
    function sendMessage(
        uint256 _otherSideNativeTokenAmount,
        address _target,
        bytes calldata _message,
        uint32 _minGasLimit
    ) external payable;

    /**
     * @notice Retrieves the address of the contract or wallet that initiated the currently
     *         executing message on the other chain. Will throw an error if there is no message
     *         currently being executed. Allows the recipient of a call to see who triggered it.
     *
     * @return Address of the sender of the currently executing message on the other chain.
     */
    function xDomainMessageSender() external view returns (address);
}
