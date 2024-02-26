const { providers, Wallet, utils } = require('ethers');
const { readDeployContract, getLogName } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { L1TransactionReceipt, L1ToL2MessageStatus } = require('@arbitrum/sdk');
const { L1ToL2MessageGasEstimator } = require('@arbitrum/sdk/dist/lib/message/L1ToL2MessageGasEstimator');
const { getBaseFee } = require('@arbitrum/sdk/dist/lib/utils/lib');
const { task } = require('hardhat/config');

require('dotenv').config();

task('changeFeeParams', 'Change fee params for zkLink').setAction(async (taskArgs, hre) => {
  const walletPrivateKey = process.env.DEVNET_PRIVKEY;
  const l1Provider = new providers.JsonRpcProvider(process.env.L1RPC);
  const l2Provider = new providers.JsonRpcProvider(process.env.L2RPC);
  const arbitrumName = process.env.ARBITRUM;
  const ethereumName = process.env.ETHEREUM;
  const l1Wallet = new Wallet(walletPrivateKey, l1Provider);
  const l2Wallet = new Wallet(walletPrivateKey, l2Provider);
  /**
   * Now we can query the required gas params using the estimateAll method in Arbitrum SDK
   */
  const l1ToL2MessageGasEstimate = new L1ToL2MessageGasEstimator(l2Provider);

  const l1WalletAddress = await l1Wallet.getAddress();
  const l1WalletBalance = utils.formatEther(await l1Wallet.getBalance());
  console.log(`${l1WalletAddress} balance on l1: ${l1WalletBalance} ether`);

  const arbitratorAddr = readDeployContract(
    logName.DEPLOY_ARBITRATOR_LOG_PREFIX,
    logName.DEPLOY_LOG_ARBITRATOR,
    ethereumName,
  );
  if (arbitratorAddr === undefined) {
    console.log('arbitrator address not exist');
    return;
  }
  console.log(`The arbitrator address: ${arbitratorAddr}`);

  const zkLinkAddr = readDeployContract(
    logName.DEPLOY_ZKLINK_LOG_PREFIX,
    logName.DEPLOY_LOG_ZKLINK_PROXY,
    arbitrumName,
  );
  if (zkLinkAddr === undefined) {
    console.log('zkLink address not exist');
    return;
  }
  console.log(`The zkLink address: ${zkLinkAddr}`);

  const l1GatewayLogName = getLogName(logName.DEPLOY_L1_GATEWAY_LOG_PREFIX, arbitrumName);
  const l1GatewayAddr = readDeployContract(l1GatewayLogName, logName.DEPLOY_GATEWAY, ethereumName);
  if (l1GatewayAddr === undefined) {
    console.log('l1 gateway address not exist');
    return;
  }
  console.log(`The l1 gateway address: ${l1GatewayAddr}`);

  const l2GatewayAddr = readDeployContract(logName.DEPLOY_L2_GATEWAY_LOG_PREFIX, logName.DEPLOY_GATEWAY, arbitrumName);
  if (l2GatewayAddr === undefined) {
    console.log('l2 gateway address not exist');
    return;
  }
  console.log(`The l2 gateway address: ${l2GatewayAddr}`);

  const arbitrator = await hre.ethers.getContractAt('Arbitrator', arbitratorAddr, l1Wallet);
  const zkLink = await hre.ethers.getContractFactory('ZkLink');
  const { INIT_FEE_PARAMS } = require('../../../script/zksync_era');
  const zkLinkCallValue = 0;
  const zkLinkCallData = zkLink.interface.encodeFunctionData('changeFeeParams', [INIT_FEE_PARAMS]);
  const l2GatewayFactory = await hre.ethers.getContractFactory('ArbitrumL2Gateway');
  const l2GatewayCallData = l2GatewayFactory.interface.encodeFunctionData('claimMessageCallback', [
    zkLinkCallValue,
    zkLinkCallData,
  ]);

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
      from: l1GatewayAddr,
      to: l2GatewayAddr,
      l2CallValue: zkLinkCallValue,
      excessFeeRefundAddress: l1WalletAddress,
      callValueRefundAddress: l2GatewayAddr,
      data: l2GatewayCallData,
    },
    l1BaseFee,
    l1Provider,
  );
  console.log(`Current retryable base submission price is: ${L1ToL2MessageGasParams.maxSubmissionCost.toString()}`);
  console.log(`Estimate gasLimit on L2 is: ${L1ToL2MessageGasParams.gasLimit.toString()}`);
  console.log(`Estimate maxFeePerGas on L2 is: ${L1ToL2MessageGasParams.maxFeePerGas.toString()}`);
  console.log(`Estimate fee to pay on L1 is: ${L1ToL2MessageGasParams.deposit.toString()}`);

  const adapterParams = utils.defaultAbiCoder.encode(
    ['uint256', 'uint256', 'uint256'],
    [L1ToL2MessageGasParams.maxSubmissionCost, L1ToL2MessageGasParams.gasLimit, L1ToL2MessageGasParams.maxFeePerGas],
  );
  console.log(`Send a l1 message to l2...`);
  let l1Tx = await arbitrator.changeFeeParams(l1GatewayAddr, INIT_FEE_PARAMS, adapterParams);
  const l1TxHash = l1Tx.hash;
  console.log(`The l1 tx hash: ${l1TxHash}`);
  const forwardMessageReceipt = await l1Tx.wait();

  const l1TxReceipt = new L1TransactionReceipt(forwardMessageReceipt);

  /**
   * In principle, a single L1 txn can trigger any number of L1-to-L2 messages (each with its own sequencer number).
   * In this case, we know our txn triggered only one
   * Here, We check if our L1 to L2 message is redeemed on L2
   */
  const messages = await l1TxReceipt.getL1ToL2Messages(l2Wallet);
  const message = messages[0];
  console.log('Waiting for the L2 execution of the transaction. This may take up to 10-15 minutes ⏰');
  const messageResult = await message.waitForStatus();
  const status = messageResult.status;
  if (status === L1ToL2MessageStatus.REDEEMED) {
    console.log(`L2 retryable ticket is executed 🥳 ${messageResult.l2TxReceipt.transactionHash}`);
  } else {
    console.log(`L2 retryable ticket is failed with status ${L1ToL2MessageStatus[status]}`);
  }
});
