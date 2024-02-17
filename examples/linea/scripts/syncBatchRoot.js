const { JsonRpcProvider, Wallet, formatEther, keccak256, toUtf8Bytes } = require('ethers');
const { LineaSDK, OnChainMessageStatus } = require('@consensys/linea-sdk');
const { readDeployContract, getLogName } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { task } = require('hardhat/config');

require('dotenv').config();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

task('syncBatchRoot', 'Forward message to L2').setAction(async (taskArgs, hre) => {
  const walletPrivateKey = process.env.DEVNET_PRIVKEY;
  const l1Provider = new JsonRpcProvider(process.env.L1RPC);
  const l2Provider = new JsonRpcProvider(process.env.L2RPC);
  const ethereumName = process.env.ETHEREUM;
  const lineaName = process.env.LINEA;
  const l1Wallet = new Wallet(walletPrivateKey, l1Provider);
  const l2Wallet = new Wallet(walletPrivateKey, l2Provider);
  const sdk = new LineaSDK({
    l1RpcUrl: process.env.L1RPC ?? '',
    l2RpcUrl: process.env.L2RPC ?? '',
    l1SignerPrivateKey: walletPrivateKey ?? '',
    l2SignerPrivateKey: walletPrivateKey ?? '',
    network: 'linea-goerli',
    mode: 'read-write',
  });
  // const l1ClaimingService = sdk.getL1ClaimingService();
  // console.log(`The l1ClaimingService Address: ${await l1ClaimingService.getAddress()}`);
  const lineaL1Contract = sdk.getL1Contract();
  const lineaL2Contract = sdk.getL2Contract();

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
  await tx.wait();
  console.log(`The tx hash: ${tx.hash}`);
  // const txHash = "0x60eda85e11f963c5317559999bd7a54ae4aa1086e8eff0e306523f9f3947bd7c";

  /**
   * Query the message informations on L1 via txHash.
   */
  const message = (await lineaL1Contract.getMessagesByTransactionHash(tx.hash)).pop();
  console.log(`The messageSender: ${message.messageSender}`);
  console.log(`The destination: ${message.destination}`);
  console.log(`The fee: ${message.fee}`);
  console.log(`The value: ${message.value}`);
  console.log(`The messageNonce: ${message.messageNonce}`);
  console.log(`The calldata: ${message.calldata}`);
  console.log(`The messageHash: ${message.messageHash}`);

  // Waiting for the official Linea bridge to forward the message to L2
  // And manually claim the message on L2
  /*eslint no-constant-condition: ["error", { "checkLoops": false }]*/
  while (true) {
    /**
     * Query the transaction status on L2 via messageHash.
     */
    const messageStatus = await lineaL2Contract.getMessageStatus(message.messageHash);
    console.log(`The message status: ${messageStatus}`);
    if (messageStatus === OnChainMessageStatus.CLAIMABLE) {
      const lineaL2Gateway = await hre.ethers.getContractAt('LineaL2Gateway', lineaL2GatewayAddr, l2Wallet);
      const tx = await lineaL2Gateway.claimMessage(
        message.value.toNumber(),
        message.calldata,
        message.messageNonce.toNumber(),
      );
      console.log(`The tx hash: ${tx.hash}`);
      const rec = await tx.wait();
      console.log(`The tx receipt: ${rec}`);
      break;
    }
    await sleep(60 * 1000 * 10);
  }
  console.log('Done');

  // Example txs:
  // https://goerli.etherscan.io/tx/0x60eda85e11f963c5317559999bd7a54ae4aa1086e8eff0e306523f9f3947bd7c
  // https://goerli.lineascan.build/tx/0x12559d43b03b7bb00a7a0305c47526d9deb1541d61117b194813a83a4fc5a2d3
});
