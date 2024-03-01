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
    l1ChainId: ethereumName !== 'ETHEREUM' ? 5 : 1, // 5 for Goerli, 1 for Ethereum
    l2ChainId: ethereumName !== 'ETHEREUM' ? 5001 : 5000, // 5001 for Mantle Testnet, 5000 for Mantle Mainnet
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
  console.log(`The call data: ${executeCalldata}`);

  // forward message to L2
  const gasLimit = 400000;
  const arbitrator = await hre.ethers.getContractAt('DummyArbitrator', arbitratorAddr, l1Wallet);
  const adapterParams = ethers.utils.defaultAbiCoder.encode(['uint256'], [gasLimit]);
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
  // https://goerli.etherscan.io/tx/0xf9293e70159720af00a35e0d9a1b0fcd917d075e1b87c2136048ba22d94b5721
  // https://explorer.testnet.mantle.xyz/tx/0xfc6c4da2fe72ce3eb474e5c8371e947cbaeb026ac77fbdb49ca8a3ad70458dfc
});
