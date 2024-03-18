const base = require('@eth-optimism/sdk');
const ethers = require('ethers');
const { readDeployContract, getLogName } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { INIT_FEE_PARAMS } = require('../../../script/zksync_era');
const { L1_MAINNET_CONTRACTS, L1_TESTNET_CONTRACTS } = require('./constants');
const { task } = require('hardhat/config');
require('dotenv').config();

async function preProcess(hre) {
  const walletPrivateKey = process.env.DEVNET_PRIVKEY;
  const l1Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L1RPC);
  const l2Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L2RPC);
  const ethereumName = process.env.ETHEREUM;
  const baseName = process.env.BASE;
  const l1Wallet = new ethers.Wallet(walletPrivateKey, l1Provider);
  const l2Wallet = new ethers.Wallet(walletPrivateKey, l2Provider);

  const messengerL1Contracts = ethereumName !== 'ETHEREUM' ? L1_TESTNET_CONTRACTS : L1_MAINNET_CONTRACTS;
  const messenger = new base.CrossChainMessenger({
    l1ChainId: await l1Wallet.getChainId(), // 11155111 for Sepolia, 1 for Ethereum
    l2ChainId: await l2Wallet.getChainId(), // 84532 for Base Sepolia, 8453 for Base Mainnet
    l1SignerOrProvider: l1Wallet,
    l2SignerOrProvider: l2Wallet,
    bedrock: true,
    contracts: {
      l1: messengerL1Contracts,
    },
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

  const zkLinkAddr = readDeployContract(logName.DEPLOY_ZKLINK_LOG_PREFIX, logName.DEPLOY_LOG_ZKLINK_PROXY, baseName);
  if (zkLinkAddr === undefined) {
    console.log('zkLink address not exist');
    return;
  }
  console.log(`The zkLink address: ${zkLinkAddr}`);

  const l1GatewayLogName = getLogName(logName.DEPLOY_L1_GATEWAY_LOG_PREFIX, baseName);
  const baseL1GatewayAddr = readDeployContract(l1GatewayLogName, logName.DEPLOY_GATEWAY, ethereumName);
  if (baseL1GatewayAddr === undefined) {
    console.log('base l1 gateway address not exist');
    return;
  }
  console.log(`The base l1 gateway address: ${baseL1GatewayAddr}`);

  const baseL2GatewayAddr = readDeployContract(logName.DEPLOY_L2_GATEWAY_LOG_PREFIX, logName.DEPLOY_GATEWAY, baseName);
  if (baseL2GatewayAddr === undefined) {
    console.log('base l2 gateway address not exist');
    return;
  }
  console.log(`The base l2 gateway address: ${baseL2GatewayAddr}`);

  // pre-execution calldata
  const zkLink = await hre.ethers.getContractAt('ZkLink', zkLinkAddr, l2Wallet);
  const executeCalldata = zkLink.interface.encodeFunctionData('changeFeeParams', [INIT_FEE_PARAMS]);
  console.log(`The call data: ${executeCalldata}`);
  const gateway = await hre.ethers.getContractAt('OptimismGateway', baseL2GatewayAddr, l2Wallet);
  const sendData = gateway.interface.encodeFunctionData('claimMessageCallback', [0, executeCalldata]);

  const gasLimit = await messenger.estimateGas.sendMessage({
    direction: 1, // L2_TO_L1, Estimating the Gas Required on L2
    target: baseL2GatewayAddr,
    message: sendData,
  });
  console.log(`The gas limit: ${gasLimit}`);

  // forward message to L2
  const arbitrator = await hre.ethers.getContractAt('Arbitrator', arbitratorAddr, l1Wallet);
  const adapterParams = ethers.utils.defaultAbiCoder.encode(['uint256'], [gasLimit]);
  console.log(`The adapter params: ${adapterParams}`);

  return {
    messenger,
    arbitrator,
    baseL1GatewayAddr,
    adapterParams,
  };
}

task('changeFeeParams', 'Change fee params for zkLink').setAction(async (_, hre) => {
  const { messenger, arbitrator, baseL1GatewayAddr, adapterParams } = await preProcess(hre);

  console.log('Prepare to forward the message to L2...');
  let tx = await arbitrator.changeFeeParams(baseL1GatewayAddr, INIT_FEE_PARAMS, adapterParams);
  const txHash = tx.hash;
  console.log(`The tx hash: ${txHash}`);
  await tx.wait();
  console.log(`The transaction has been executed on L1`);

  /**
   * Query the message informations on L1 via txHash.
   */
  const message = (await messenger.getMessagesByTransaction(txHash)).pop();
  // Waiting for the official base bridge to forward the message to L2
  const rec = await messenger.waitForMessageReceipt(message);
  console.log(`The tx receipt: ${JSON.stringify(rec, null, 2)}`);
  console.log('Done');
});

task('encodeChangeFeeParams', 'Get the calldata of changing fee params for zkLink').setAction(async (_, hre) => {
  const { arbitrator, baseL1GatewayAddr, adapterParams } = await preProcess(hre);

  const calldata = arbitrator.interface.encodeFunctionData('changeFeeParams', [
    baseL1GatewayAddr,
    INIT_FEE_PARAMS,
    adapterParams,
  ]);
  console.log(`The changeFeeParams calldata: ${calldata}`);
});
