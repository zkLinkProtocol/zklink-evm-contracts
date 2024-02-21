const { JsonRpcProvider, Wallet, formatEther } = require('ethers');
const { LineaSDK, OnChainMessageStatus } = require('@consensys/linea-sdk');
const { readDeployLogField, readDeployContract, getLogName } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { task, types } = require('hardhat/config');

require('dotenv').config();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

task('setSecondaryGateway', 'Send secondary gateway')
  .addOptionalParam(
    'arbitrator',
    'The arbitrator address (default get from arbitrator deploy log)',
    undefined,
    types.string,
  )
  .addParam('targetNetwork', 'L2 network name', undefined, types.string, false)
  .addOptionalParam('active', 'Enable the gateway?', true, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const ethereumName = process.env.ETHEREUM;
    const lineaName = process.env.LINEA;
    console.log(`Ethereum net name: ${ethereumName}`);
    console.log(`Linea net name: ${lineaName}`);

    let arbitratorAddr = taskArgs.arbitrator;
    let targetNetwork = taskArgs.targetNetwork;
    const active = taskArgs.active;
    console.log(`Enable the gateway? ${active}`);
    if (targetNetwork === lineaName) {
      console.log('Can not set for primary chain');
      return;
    }

    const walletPrivateKey = process.env.DEVNET_PRIVKEY;
    const l1Provider = new JsonRpcProvider(process.env.L1RPC);
    const l2Provider = new JsonRpcProvider(process.env.L2RPC);
    const l1Wallet = new Wallet(walletPrivateKey, l1Provider);
    const l2Wallet = new Wallet(walletPrivateKey, l2Provider);
    const sdk = new LineaSDK({
      l1RpcUrl: process.env.L1RPC ?? '',
      l2RpcUrl: process.env.L2RPC ?? '',
      l1SignerPrivateKey: walletPrivateKey ?? '',
      l2SignerPrivateKey: walletPrivateKey ?? '',
      network: ethereumName === 'GOERLI' ? 'linea-goerli' : 'linea-mainnet',
      mode: 'read-write',
    });
    const lineaL1Contract = sdk.getL1Contract();
    const lineaL2Contract = sdk.getL2Contract();

    const l1WalletAddress = await l1Wallet.getAddress();
    const l1WalletBalance = formatEther(await l1Provider.getBalance(l1WalletAddress));
    console.log(`${l1WalletAddress} balance on l1: ${l1WalletBalance} ether`);
    const l2WalletAddress = await l2Wallet.getAddress();
    const l2WalletBalance = formatEther(await l2Provider.getBalance(l2WalletAddress));
    console.log(`${l2WalletAddress} balance on l2: ${l2WalletBalance} ether`);

    if (arbitratorAddr === undefined) {
      arbitratorAddr = readDeployLogField(
        logName.DEPLOY_ARBITRATOR_LOG_PREFIX,
        logName.DEPLOY_LOG_ARBITRATOR,
        ethereumName,
      );
    }
    if (arbitratorAddr === undefined) {
      console.log('The arbitrator address not exist');
      return;
    }
    console.log(`The arbitrator address: ${arbitratorAddr}`);

    let l1GatewayAddr;
    if (targetNetwork === ethereumName) {
      l1GatewayAddr = readDeployContract(logName.DEPLOY_ETH_GATEWAY_LOG_PREFIX, logName.DEPLOY_GATEWAY, ethereumName);
    } else {
      const l1GatewayLogName = getLogName(logName.DEPLOY_L1_GATEWAY_LOG_PREFIX, targetNetwork);
      l1GatewayAddr = readDeployContract(l1GatewayLogName, logName.DEPLOY_GATEWAY, ethereumName);
    }
    if (l1GatewayAddr === undefined) {
      console.log('L1 gateway address not found');
      return;
    }
    console.log(`The secondary chain l1 gateway address: ${l1GatewayAddr}`);

    // forward message to L2
    const arbitrator = await hre.ethers.getContractAt('Arbitrator', arbitratorAddr, l1Wallet);
    const adapterParams = '0x';
    let tx = await arbitrator.setSecondaryChainGateway(l1GatewayAddr, active, adapterParams);
    console.log(`The tx hash: ${tx.hash}`);
    await tx.wait();
    console.log(`The tx confirmed`);

    /**
     * Query the transaction status on L2 via messageHash.
     */
    const message = (await lineaL1Contract.getMessagesByTransactionHash(tx.hash)).pop();

    // Waiting for the official Linea bridge to forward the message to L2
    // And manually claim the message on L2
    /*eslint no-constant-condition: ["error", { "checkLoops": false }]*/
    while (true) {
      const messageStatus = await lineaL2Contract.getMessageStatus(message.messageHash);
      console.log(`The message status: ${messageStatus}`);
      if (messageStatus === OnChainMessageStatus.CLAIMABLE) {
        const tx = await lineaL2Contract.claim(message);
        console.log(`The tx hash: ${tx.hash}`);
        await tx.wait();
        console.log(`The tx confirmed`);
        break;
      }
      await sleep(60 * 1000);
    }
    console.log('Done');
  });
