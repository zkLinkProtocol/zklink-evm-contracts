const { Provider, Wallet, utils } = require('zksync-ethers');
const { ethers } = require('ethers');
const { readDeployContract } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { task, types } = require('hardhat/config');

require('dotenv').config();

async function initNetwork() {
  const walletPrivateKey = process.env.DEVNET_PRIVKEY;
  const l1Provider = new Provider(process.env.L1RPC);
  const l2Provider = new Provider(process.env.L2RPC);
  const ethereumName = process.env.ETHEREUM;
  const zkSyncWallet = new Wallet(walletPrivateKey, l2Provider, l1Provider);

  const mailBoxAddr = await l1Provider.getMainContractAddress();
  if (mailBoxAddr === undefined) {
    console.log('The zksync mailbox address not exist');
    return;
  }
  console.log(`The mailbox address: ${mailBoxAddr}`);

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
  return {
    l1GovernanceAddr,
    mailBoxAddr,
    l1Provider,
    l2Provider,
    zkSyncWallet,
  };
}

async function initZkLinkNetwork() {
  const walletPrivateKey = process.env.ZKLINK_DEVNET_PRIVKEY;
  const l1Provider = new Provider(process.env.ZKLINK_L1RPC);
  const l2Provider = new Provider(process.env.ZKLINK_L2RPC);
  const lineaName = process.env.LINEA;
  const zkSyncWallet = new Wallet(walletPrivateKey, l2Provider, l1Provider);

  const mailBoxAddr = await l2Provider.getMainContractAddress();
  if (mailBoxAddr === undefined) {
    console.log('The zksync mailbox address not exist');
    return;
  }
  console.log(`The mailbox address: ${mailBoxAddr}`);

  const l1GovernanceAddr = readDeployContract(
    logName.DEPLOY_LINEA_L2_GOVERNANCE_LOG_PREFIX,
    logName.DEPLOY_LOG_GOVERNANCE,
    lineaName,
  );
  if (l1GovernanceAddr === undefined) {
    console.log('governance address not exist');
    return;
  }
  console.log(`The l1 governance address: ${l1GovernanceAddr}`);
  return {
    l1GovernanceAddr,
    mailBoxAddr,
    l1Provider,
    l2Provider,
    zkSyncWallet,
  };
}

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
    const networkInfo = await initNetwork();
    await encodeL1ToL2Calldata(taskArgs, hre, networkInfo);
  });

task('zkLinkEncodeL1ToL2Calldata', 'Encode call data for l1 to l2')
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
    const networkInfo = await initZkLinkNetwork();
    await encodeL1ToL2Calldata(taskArgs, hre, networkInfo);
  });

task('checkL1TxStatus', 'Check the l1 tx status')
  .addParam('l1TxHash', 'The l1 tx hash', undefined, types.string)
  .setAction(async taskArgs => {
    const l1Provider = new Provider(process.env.L1RPC);
    const l2Provider = new Provider(process.env.L2RPC);
    await checkL1TxStatus(taskArgs, l1Provider, l2Provider);
  });

task('zkLinkCheckL1TxStatus', 'Check the l1 tx status')
  .addParam('l1TxHash', 'The l1 tx hash', undefined, types.string)
  .setAction(async taskArgs => {
    const l1Provider = new Provider(process.env.ZKLINK_L1RPC);
    const l2Provider = new Provider(process.env.ZKLINK_L2RPC);
    await checkL1TxStatus(taskArgs, l1Provider, l2Provider);
  });

async function encodeL1ToL2Calldata(taskArgs, hre, networkInfo) {
  const { l1GovernanceAddr, mailBoxAddr, l1Provider, l2Provider, zkSyncWallet } = networkInfo;

  const l2ToContractAddress = taskArgs.to;
  const l2CallData = taskArgs.l2CallData;
  const l2CallValue = taskArgs.l2CallValue;
  const refundAddress = taskArgs.refundAddress;
  console.log(`The l2 target contract address: ${l2ToContractAddress}`);
  console.log(`The l2 call data to target address: ${l2CallData}`);
  console.log(`The l2 call value to target address: ${l2CallValue}`);
  console.log(`The refund address: ${refundAddress}`);

  const l2GovernanceAddr = utils.applyL1ToL2Alias(l1GovernanceAddr);
  console.log(`The l2 governance address: ${l2GovernanceAddr}`);

  /**
   * The estimateL1ToL2Execute method gives us the gasLimit for sending an L1->L2 message
   */

  const l2GasLimit = await l2Provider.estimateL1ToL2Execute({
    contractAddress: l2GovernanceAddr,
    calldata: l2CallData,
    overrides: {
      value: l2CallValue,
    },
  });
  console.log(`Estimate gasLimit on L1 is ${l2GasLimit.valueOf()}`);

  /**
   * The getGasPrice method gives us the current gas price on L1
   */
  const l1GasPrice = await l1Provider.getGasPrice();
  console.log(`Current gas price on L1 is ${ethers.formatEther(l1GasPrice)} ETH`);

  /**
   * The getBaseCost method gives us the base cost of sending an L1->L2 message
   */
  const baseCost = await zkSyncWallet.getBaseCost({
    // L2 computation
    gasLimit: l2GasLimit,
    // L1 gas price
    gasPrice: l1GasPrice,
  });
  console.log(`Executing this transaction will cost ${ethers.formatEther(baseCost)} ETH`);
  const finalL1ToL2MsgValue = BigInt(l2CallValue) + BigInt(baseCost);
  console.log(`The msg value: ${ethers.formatEther(finalL1ToL2MsgValue)} ETH`);

  const mailBox = await hre.ethers.getContractAt('IMailbox', '0x0000000000000000000000000000000000000000');
  const mailBoxCalldata = mailBox.interface.encodeFunctionData('requestL2Transaction', [
    l2ToContractAddress,
    l2CallValue,
    l2CallData,
    l2GasLimit,
    utils.REQUIRED_L1_TO_L2_GAS_PER_PUBDATA_LIMIT,
    [],
    refundAddress,
  ]);

  console.log(`The l1 to l2 call target: ${mailBoxAddr}`);
  console.log(`The l1 to l2 call data: ${mailBoxCalldata}`);
  console.log(`The l1 to l2 call value: ${finalL1ToL2MsgValue}`);
}

async function checkL1TxStatus(taskArgs, l1Provider, l2Provider) {
  const l1TxHash = taskArgs.l1TxHash;
  console.log(`The l1 tx hash: ${l1TxHash}`);
  console.log('Waiting for the L2 execution of the transaction. This may take up to 10-15 minutes ⏰');
  const txHandle = await l1Provider.getTransaction(l1TxHash);
  const l2Tx = await l2Provider.getL2TransactionFromPriorityOp(txHandle);
  console.log(`The l2 tx hash: ${l2Tx.hash}`);
  const l2TxStatus = await l2Provider.getTransactionStatus(l2Tx.hash);
  console.log(`The l2 tx status: ${l2TxStatus}`);
}
