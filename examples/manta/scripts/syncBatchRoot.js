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
  const mantaName = process.env.MANTA;
  const l1Wallet = new ethers.Wallet(walletPrivateKey, l1Provider);
  const l2Wallet = new ethers.Wallet(walletPrivateKey, l2Provider);

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

  const zkLinkAddr = readDeployContract(logName.DEPLOY_ZKLINK_LOG_PREFIX, logName.DEPLOY_LOG_ZKLINK_PROXY, mantaName);
  if (zkLinkAddr === undefined) {
    console.log('zkLink address not exist');
    return;
  }
  console.log(`The zkLink address: ${zkLinkAddr}`);

  const l1GatewayLogName = getLogName(logName.DEPLOY_L1_GATEWAY_LOG_PREFIX, mantaName);
  const mantaL1GatewayAddr = readDeployContract(l1GatewayLogName, logName.DEPLOY_GATEWAY, ethereumName);
  if (mantaL1GatewayAddr === undefined) {
    console.log('manta l1 gateway address not exist');
    return;
  }
  console.log(`The manta l1 gateway address: ${mantaL1GatewayAddr}`);

  const mantaL2GatewayAddr = readDeployContract(
    logName.DEPLOY_L2_GATEWAY_LOG_PREFIX,
    logName.DEPLOY_GATEWAY,
    mantaName,
  );
  if (mantaL2GatewayAddr === undefined) {
    console.log('manta l2 gateway address not exist');
    return;
  }
  console.log(`The manta l2 gateway address: ${mantaL2GatewayAddr}`);

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
  const minGasLimit = 0;
  const adapterParams = ethers.utils.defaultAbiCoder.encode(['uint256'], [minGasLimit]);
  console.log('Prepare to forward the message to L2...');
  let tx = await arbitrator.forwardMessage(mantaL1GatewayAddr, 0, executeCalldata, adapterParams);
  const txHash = tx.hash;
  await tx.wait();
  console.log(`The tx hash: ${txHash}`);
  // const txHash = "0x61e78c71aca383f9e15ccebae7ecca355131227319a80a338ac9f809d752a344";

  // Waiting for the official optimism bridge to forward the message to L2
  console.log('Done');

  // Example txs:
  // https://goerli.etherscan.io/tx/0x0fc043fd0bf6bb306c4a802cf8ac89498e2298ad1d85b56fdd4bbc840016c161
  // https://pacific-explorer.testnet.manta.network/tx/0xd6eb96a4be4613371a37a298c6738817971586a2144d2200b2d9ab3cfdc9addf
});
