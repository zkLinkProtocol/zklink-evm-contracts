const optimism = require('@eth-optimism/sdk');
const ethers = require('ethers');
const { readDeployContract, getLogName } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { task } = require('hardhat/config');
require('dotenv').config();

task('syncBatchRoot', 'Forward message to L2').setAction(async (taskArgs, hre) => {
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

  const optimismL2GatewayAddr = readDeployContract(
    logName.DEPLOY_L2_GATEWAY_LOG_PREFIX,
    logName.DEPLOY_GATEWAY,
    optimismName,
  );
  if (optimismL2GatewayAddr === undefined) {
    console.log('optimism l2 gateway address not exist');
    return;
  }
  console.log(`The optimism l2 gateway address: ${optimismL2GatewayAddr}`);

  // pre-execution calldata
  const zkLink = await hre.ethers.getContractAt('DummyZkLink', zkLinkAddr, l2Wallet);
  const zklinkIface = zkLink.interface;
  const blockNumber = await l2Provider.getBlockNumber();
  console.log(`The current block number: ${blockNumber}`);
  const l2LogsRootHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`L2 logs root hash ${blockNumber}`));
  console.log(`The l2 logs root hash: ${l2LogsRootHash}`);
  const executeCalldata = zklinkIface.encodeFunctionData('syncBatchRoot', [blockNumber, l2LogsRootHash, 0]);
  console.log(`The call data: ${executeCalldata}`);

  // forward message to L2
  const arbitrator = await hre.ethers.getContractAt('DummyArbitrator', arbitratorAddr, l1Wallet);
  const minGasLimit = 200000;
  const adapterParams = ethers.utils.defaultAbiCoder.encode(['uint256'], [minGasLimit]);
  console.log('Prepare to forward the message to L2...');
  let tx = await arbitrator.forwardMessage(optimismL1GatewayAddr, 0, executeCalldata, adapterParams, {
    maxFeePerGas: 10000000000,
    maxPriorityFeePerGas: 5000000000,
  });
  const txHash = tx.hash;
  await tx.wait();
  console.log(`The tx hash: ${txHash}`);
  // const txHash = "0x61e78c71aca383f9e15ccebae7ecca355131227319a80a338ac9f809d752a344";

  /**
   * Query the message informations on L1 via txHash.
   */
  const message = (await messenger.getMessagesByTransaction(txHash)).pop();
  console.log(`The message: ${JSON.stringify(message)}`);
  // Waiting for the official optimism bridge to forward the message to L2
  const rec = await messenger.waitForMessageReceipt(message);
  console.log(`The gas limit: ${JSON.stringify(rec)}`);
  console.log('Done');

  // Example txs:
  // https://sepolia.etherscan.io/tx/0x4245b341b159a79d6cf35b917b849ccc8d5b3ae6fac947bc7376650844bdc43c
  // https://sepolia-optimistic.etherscan.io/tx/0x7779fbaf0358f34d2303d77019d09c39a0a0b178d9f6c4235c7bc5519ba9b58b
});
