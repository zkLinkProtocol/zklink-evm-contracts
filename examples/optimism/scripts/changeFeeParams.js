const optimism = require('@eth-optimism/sdk');
const ethers = require('ethers');
const { readDeployContract, getLogName } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { task } = require('hardhat/config');
require('dotenv').config();

task('changeFeeParams', 'Change fee params for zkLink').setAction(async (taskArgs, hre) => {
  const walletPrivateKey = process.env.DEVNET_PRIVKEY;
  const l1Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L1RPC);
  const l2Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L2RPC);
  const ethereumName = process.env.ETHEREUM;
  const optimismName = process.env.OPTIMISM;
  const l1Wallet = new ethers.Wallet(walletPrivateKey, l1Provider);
  const l2Wallet = new ethers.Wallet(walletPrivateKey, l2Provider);
  const messenger = new optimism.CrossChainMessenger({
    l1ChainId: 11155111, // 11155111 for Sepolia, 1 for Ethereum
    l2ChainId: 11155420, // 11155420 for OP Sepolia, 10 for OP Mainnet
    l1SignerOrProvider: l1Wallet,
    l2SignerOrProvider: l2Wallet,
  });

  const l1WalletAddress = await l1Wallet.getAddress();
  const l1WalletBalance = ethers.utils.formatEther(await l1Wallet.getBalance());
  console.log(`${l1WalletAddress} balance on l1: ${l1WalletBalance} ether`);

  const arbitratorAddr = readDeployContract(
    logName.DEPLOY_ARBITRATOR_LOG_PREFIX,
    logName.DEPLOY_LOG_ARBITRATOR,
    ethereumName,
  );
  if (arbitratorAddr === undefined) {
    console.log('The arbitrator address not exist');
    return;
  }
  console.log(`The arbitrator address: ${arbitratorAddr}`);

  const zkLinkAddr = readDeployContract(
    logName.DEPLOY_ZKLINK_LOG_PREFIX,
    logName.DEPLOY_LOG_ZKLINK_PROXY,
    optimismName,
  );
  if (zkLinkAddr === undefined) {
    console.log('zkLink address not exist');
    return;
  }
  console.log(`The zkLink address: ${zkLinkAddr}`);

  const l1GatewayLogName = getLogName(logName.DEPLOY_L1_GATEWAY_LOG_PREFIX, optimismName);
  const optimismL1GatewayAddr = readDeployContract(l1GatewayLogName, logName.DEPLOY_GATEWAY, ethereumName);
  if (optimismL1GatewayAddr === undefined) {
    console.log('optimism l1 gateway address not exist');
    return;
  }
  console.log(`The optimism l1 gateway address: ${optimismL1GatewayAddr}`);

  // forward message to L2
  const arbitrator = await hre.ethers.getContractAt('Arbitrator', arbitratorAddr, l1Wallet);
  const minGasLimit = 200000;
  const adapterParams = ethers.utils.defaultAbiCoder.encode(['uint256'], [minGasLimit]);
  const { INIT_FEE_PARAMS } = require('../../../script/zksync_era');
  console.log('Prepare to forward the message to L2...');
  let tx = await arbitrator.changeFeeParams(optimismL1GatewayAddr, INIT_FEE_PARAMS, adapterParams);
  const txHash = tx.hash;
  await tx.wait();
  console.log(`The tx hash: ${txHash}`);

  /**
   * Query the message informations on L1 via txHash.
   */
  const message = (await messenger.getMessagesByTransaction(txHash)).pop();
  console.log(`The message: ${JSON.stringify(message)}`);
  // Waiting for the official optimism bridge to forward the message to L2
  const rec = await messenger.waitForMessageReceipt(message);
  console.log(`The tx receipt: ${JSON.stringify(rec)}`);
  console.log('Done');
});