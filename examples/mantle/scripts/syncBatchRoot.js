const mantle = require('@mantleio/sdk');
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
  const mantleName = process.env.MANTLE;
  const l1Wallet = new ethers.Wallet(walletPrivateKey, l1Provider);
  const l2Wallet = new ethers.Wallet(walletPrivateKey, l2Provider);

  const messenger = new mantle.CrossChainMessenger({
    l1ChainId: await l1Wallet.getChainId(), // 5 for Goerli, 1 for Ethereum
    l2ChainId: await l2Wallet.getChainId(), // 5003 for Mantle Testnet, 5000 for Mantle Mainnet
    l1SignerOrProvider: l1Wallet,
    l2SignerOrProvider: l2Wallet,
    bedrock: true,
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

  const zkLinkAddr = readDeployContract(logName.DEPLOY_ZKLINK_LOG_PREFIX, logName.DEPLOY_LOG_ZKLINK_PROXY, mantleName);
  if (zkLinkAddr === undefined) {
    console.log('zkLink address not exist');
    return;
  }
  console.log(`The zkLink address: ${zkLinkAddr}`);

  const l1GatewayLogName = getLogName(logName.DEPLOY_L1_GATEWAY_LOG_PREFIX, mantleName);
  const mantleL1GatewayAddr = readDeployContract(l1GatewayLogName, logName.DEPLOY_GATEWAY, ethereumName);
  if (mantleL1GatewayAddr === undefined) {
    console.log('mantle l1 gateway address not exist');
    return;
  }
  console.log(`The mantle l1 gateway address: ${mantleL1GatewayAddr}`);

  const mantleL2GatewayAddr = readDeployContract(
    logName.DEPLOY_L2_GATEWAY_LOG_PREFIX,
    logName.DEPLOY_GATEWAY,
    mantleName,
  );
  if (mantleL2GatewayAddr === undefined) {
    console.log('mantle l2 gateway address not exist');
    return;
  }
  console.log(`The mantle l2 gateway address: ${mantleL2GatewayAddr}`);

  // pre-execution calldata
  const zkLink = await hre.ethers.getContractAt('DummyZkLink', zkLinkAddr, l2Wallet);
  const zklinkIface = zkLink.interface;
  const blockNumber = await l2Provider.getBlockNumber();
  console.log(`The current block number: ${blockNumber}`);
  const l2LogsRootHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`L2 logs root hash ${blockNumber}`));
  console.log(`The l2 logs root hash: ${l2LogsRootHash}`);
  const executeCalldata = zklinkIface.encodeFunctionData('syncBatchRoot', [blockNumber, l2LogsRootHash, 0]);
  console.log(`The executeCalldata: ${executeCalldata}`);

  const gateway = await hre.ethers.getContractAt('OptimismGateway', mantleL2GatewayAddr, l2Wallet);
  const sendData = gateway.interface.encodeFunctionData('claimMessageCallback', [0, executeCalldata]);

  const gasLimit = await l1Provider.estimateGas({
    from: l1WalletAddress,
    to: mantleL2GatewayAddr,
    data: sendData,
  });
  console.log(`The gas limit: ${gasLimit}`);

  // forward message to L2
  const arbitrator = await hre.ethers.getContractAt('DummyArbitrator', arbitratorAddr, l1Wallet);
  const adapterParams = ethers.utils.defaultAbiCoder.encode(['uint256'], [gasLimit]);
  console.log(`The adapterParams: ${adapterParams}`);
  console.log('Prepare to forward the message to L2...');
  let tx = await arbitrator.forwardMessage(mantleL1GatewayAddr, 0, executeCalldata, adapterParams);
  const txHash = tx.hash;
  console.log(`The tx hash: ${txHash}`);
  await tx.wait();
  console.log(`The transaction has been executed on L1`);

  /**
   * Query the message receipt on L1 via txHash.
   */
  // Waiting for the official mantle bridge to forward the message to L2
  const rec = await messenger.waitForMessageReceipt(txHash);
  console.log(`The tx receipt: ${JSON.stringify(rec, null, 2)}`);
  console.log('Done');

  // Example txs:
  // https://sepolia.etherscan.io/tx/0xf600a71aaa7631dbbd01f94b821c1bd59ab0737410a0d8b198bf375122f42d2a
  // https://explorer.sepolia.mantle.xyz/tx/0xd11cd5f651b64fc44dbe6509589467b6ab682831733004992a091cda0104567f
});
