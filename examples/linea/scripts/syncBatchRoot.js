const { JsonRpcProvider, Wallet, formatEther, keccak256, toUtf8Bytes } = require('ethers');
const { readDeployContract, getLogName } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { task } = require('hardhat/config');
const { claimL1ToL2Message } = require('./common');

require('dotenv').config();

task('syncBatchRoot', 'Forward message to L2').setAction(async (taskArgs, hre) => {
  const walletPrivateKey = process.env.DEVNET_PRIVKEY;
  const l1Provider = new JsonRpcProvider(process.env.L1RPC);
  const l2Provider = new JsonRpcProvider(process.env.L2RPC);
  const ethereumName = process.env.ETHEREUM;
  const lineaName = process.env.LINEA;
  const l1Wallet = new Wallet(walletPrivateKey, l1Provider);
  const l2Wallet = new Wallet(walletPrivateKey, l2Provider);

  const l1WalletAddress = await l1Wallet.getAddress();
  const l1WalletBalance = formatEther(await l1Provider.getBalance(l1WalletAddress));
  console.log(`${l1WalletAddress} balance on l1: ${l1WalletBalance} ether`);
  const l2WalletAddress = await l2Wallet.getAddress();
  const l2WalletBalance = formatEther(await l2Provider.getBalance(l2WalletAddress));
  console.log(`${l2WalletAddress} balance on l2: ${l2WalletBalance} ether`);

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

  const zkLinkAddr = readDeployContract(logName.DEPLOY_ZKLINK_LOG_PREFIX, logName.DEPLOY_LOG_ZKLINK_PROXY, lineaName);
  if (zkLinkAddr === undefined) {
    console.log('zkLink address not exist');
    return;
  }
  console.log(`The zkLink address: ${zkLinkAddr}`);

  const l1GatewayLogName = getLogName(logName.DEPLOY_L1_GATEWAY_LOG_PREFIX, lineaName);
  const lineaL1GatewayAddr = readDeployContract(l1GatewayLogName, logName.DEPLOY_GATEWAY, ethereumName);
  if (lineaL1GatewayAddr === undefined) {
    console.log('linea l1 gateway address not exist');
    return;
  }
  console.log(`The linea l1 gateway address: ${lineaL1GatewayAddr}`);

  const lineaL2GatewayAddr = readDeployContract(
    logName.DEPLOY_L2_GATEWAY_LOG_PREFIX,
    logName.DEPLOY_GATEWAY,
    lineaName,
  );
  if (lineaL2GatewayAddr === undefined) {
    console.log('linea l2 gateway address not exist');
    return;
  }
  console.log(`The linea l2 gateway address: ${lineaL2GatewayAddr}`);

  // pre-execution calldata
  const zkLink = await hre.ethers.getContractAt('DummyZkLink', zkLinkAddr, l2Wallet);
  const zklinkIface = zkLink.interface;
  const blockNumber = await l2Provider.getBlockNumber();
  console.log(`The current block number: ${blockNumber}`);
  const l2LogsRootHash = keccak256(toUtf8Bytes(`L2 logs root hash ${blockNumber}`));
  console.log(`The l2 logs root hash: ${l2LogsRootHash}`);
  const executeCalldata = zklinkIface.encodeFunctionData('syncBatchRoot', [blockNumber, l2LogsRootHash, 0]);
  console.log(`The call data: ${executeCalldata}`);

  // forward message to L2
  const arbitrator = await hre.ethers.getContractAt('DummyArbitrator', arbitratorAddr, l1Wallet);
  const adapterParams = '0x';
  let tx = await arbitrator.forwardMessage(lineaL1GatewayAddr, 0, executeCalldata, adapterParams);
  console.log(`The l1 tx hash: ${tx.hash}`);
  await tx.wait();
  console.log(`The l1 tx confirmed`);
  await claimL1ToL2Message(tx.hash);

  // Example txs:
  // https://goerli.etherscan.io/tx/0x60eda85e11f963c5317559999bd7a54ae4aa1086e8eff0e306523f9f3947bd7c
  // https://goerli.lineascan.build/tx/0x12559d43b03b7bb00a7a0305c47526d9deb1541d61117b194813a83a4fc5a2d3
});
