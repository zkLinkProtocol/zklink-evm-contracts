const { providers } = require('ethers');
const { readDeployContract } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { getBaseFee } = require('@arbitrum/sdk/dist/lib/utils/lib');
const { task, types } = require('hardhat/config');
const { zkLinkConfig } = require('../../../script/zklink_config');
const { ParentTransactionReceipt, ParentToChildMessageStatus, ChildTransactionReceipt, ChildToParentMessageStatus, ParentToChildMessageGasEstimator } = require('@arbitrum/sdk');

require('dotenv').config();

task('encodeL1ToL2Calldata', 'Encode call data for l1 to l2')
  .addParam('to', 'The l2 target address', undefined, types.string)
  .addParam('l2CallData', 'The l2 call data to target address', undefined, types.string)
  .addParam('l2CallValue', 'The l2 call value to target address', undefined, types.int)
  .addParam(
    'refundAddress',
    'The excess fee and value refund address(should be an EOA address)',
    undefined,
    types.string,
  )
  .setAction(async (taskArgs, hre) => {
    const l2ToContractAddress = taskArgs.to;
    const l2CallData = taskArgs.l2CallData;
    const l2CallValue = taskArgs.l2CallValue;
    const refundAddress = taskArgs.refundAddress;
    console.log(`The l2 target contract address: ${l2ToContractAddress}`);
    console.log(`The l2 call data to target address: ${l2CallData}`);
    console.log(`The l2 call value to target address: ${l2CallValue}`);
    console.log(`The refund address: ${refundAddress}`);

    const l1Provider = new providers.JsonRpcProvider(process.env.L1RPC);
    const l2Provider = new providers.JsonRpcProvider(process.env.L2RPC);
    const arbitrumName = process.env.ARBITRUM;
    const ethereumName = process.env.ETHEREUM;

    const l2ChainInfo = zkLinkConfig[arbitrumName];
    if (l2ChainInfo === undefined) {
      console.log('The l2 chain info not exist');
      return;
    }
    const inboxAddr = l2ChainInfo['l1Gateway']['constructParams'][0];
    if (inboxAddr === undefined) {
      console.log('The arbitrum inbox address not exist');
      return;
    }
    console.log(`The inbox address: ${inboxAddr}`);

    const l1GovernanceAddr = readDeployContract(
      logName.DEPLOY_GOVERNANCE_LOG_PREFIX,
      logName.DEPLOY_LOG_GOVERNANCE,
      ethereumName,
    );
    if (l1GovernanceAddr === undefined) {
      console.log('governance address not exist');
      return;
    }
    console.log(`The l1 governance address: ${l1GovernanceAddr}`);
    /**
     * Now we can query the required gas params using the estimateAll method in Arbitrum SDK
     */
    const l1ToL2MessageGasEstimate = new ParentToChildMessageGasEstimator(l2Provider);

    /**
     * The estimateAll method gives us the following values for sending an L1->L2 message
     * (1) maxSubmissionCost: The maximum cost to be paid for submitting the transaction
     * (2) gasLimit: The L2 gas limit
     * (3) deposit: The total amount to deposit on L1 to cover L2 gas and L2 call value
     */
    const l1BaseFee = await getBaseFee(l1Provider);
    console.log(`Current base fee on L1 is: ${l1BaseFee}`);
    const L1ToL2MessageGasParams = await l1ToL2MessageGasEstimate.estimateAll(
      {
        from: l1GovernanceAddr,
        to: l2ToContractAddress,
        l2CallValue: l2CallValue,
        excessFeeRefundAddress: refundAddress,
        callValueRefundAddress: refundAddress,
        data: l2CallData,
      },
      l1BaseFee,
      l1Provider,
    );
    console.log(`Current retryable base submission price is: ${L1ToL2MessageGasParams.maxSubmissionCost.toString()}`);
    console.log(`Estimate gasLimit on L2 is: ${L1ToL2MessageGasParams.gasLimit.toString()}`);
    console.log(`Estimate maxFeePerGas on L2 is: ${L1ToL2MessageGasParams.maxFeePerGas.toString()}`);
    console.log(`Estimate fee to pay on L1 is: ${L1ToL2MessageGasParams.deposit.toString()}`);

    const inbox = await hre.ethers.getContractAt('Inbox', '0x0000000000000000000000000000000000000000');
    const inboxCalldata = inbox.interface.encodeFunctionData('createRetryableTicket', [
      l2ToContractAddress,
      l2CallValue,
      L1ToL2MessageGasParams.maxSubmissionCost,
      refundAddress,
      refundAddress,
      L1ToL2MessageGasParams.gasLimit,
      L1ToL2MessageGasParams.maxFeePerGas,
      l2CallData,
    ]);
    console.log(`The l1 to l2 call target: ${inboxAddr}`);
    console.log(`The l1 to l2 call data: ${inboxCalldata}`);
    console.log(`The l1 to l2 call value: ${L1ToL2MessageGasParams.deposit.toString()}`);
  });

task('checkL1TxStatus', 'Check the l1 tx status')
  .addParam('l1TxHash', 'The l1 tx hash', undefined, types.string)
  .setAction(async taskArgs => {
    const l1TxHash = taskArgs.l1TxHash;
    console.log(`The l1 tx hash: ${l1TxHash}`);

    const l1Provider = new providers.JsonRpcProvider(process.env.L1RPC);
    const l2Provider = new providers.JsonRpcProvider(process.env.L2RPC);
    const l1TxReceipt = new ParentTransactionReceipt(await l1Provider.getTransactionReceipt(l1TxHash));

    /**
     * In principle, a single L1 txn can trigger any number of L1-to-L2 messages (each with its own sequencer number).
     * In this case, we know our txn triggered only one
     * Here, We check if our L1 to L2 message is redeemed on L2
     */
    const messages = await l1TxReceipt.getParentToChildMessages(l2Provider);
    const message = messages[0];
    console.log('Waiting for the L2 execution of the transaction. This may take up to 10-15 minutes ⏰');
    const messageResult = await message.waitForStatus();
    const status = messageResult.status;
    if (status === ParentToChildMessageStatus.REDEEMED) {
      console.log(`L2 retryable ticket is executed 🥳 ${messageResult.childTxReceipt.transactionHash}`);
    } else {
      console.log(`L2 retryable ticket is failed with status ${ParentToChildMessageStatus[status]}`);
    }
  });

task('checkL2TxStatus', 'Check the l2 tx status')
  .addParam('l2TxHash', 'The l2 tx hash', undefined, types.string)
  .setAction(async (taskArgs) => {
    const l2TxHash = taskArgs.l2TxHash;
    console.log(`The l2 tx hash: ${l2TxHash}`);

    const l1Provider = new providers.JsonRpcProvider(process.env.L1RPC);
    const l2Provider = new providers.JsonRpcProvider(process.env.L2RPC);
    const txReceipt = await l2Provider.getTransactionReceipt(
      l2TxHash,
    );
    const arbL2Receipt = new ChildTransactionReceipt(txReceipt);
    const l2ToL1Msg = (
      await arbL2Receipt.getChildToParentMessages(l1Provider)
    ).pop();
    const msgStatus = await l2ToL1Msg.status(l2Provider);
    console.log(`The l2 message status: ${ChildToParentMessageStatus[msgStatus]}`);
  });
