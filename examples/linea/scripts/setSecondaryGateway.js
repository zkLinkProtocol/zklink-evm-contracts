const { JsonRpcProvider, Wallet, formatEther } = require('ethers');
const { readDeployLogField, readDeployContract, getLogName } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { task, types } = require('hardhat/config');
const { claimL1ToL2Message } = require('./common');

require('dotenv').config();

task('setSecondaryGateway', 'Set secondary gateway')
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
    console.log(`The l1 tx hash: ${tx.hash}`);
    await tx.wait();
    console.log(`The l1 tx confirmed`);
    await claimL1ToL2Message(tx.hash);
  });

task('encodeSetSecondaryGateway', 'Get the calldata of set secondary gateway')
  .addParam('targetNetwork', 'L2 network name', undefined, types.string, false)
  .addOptionalParam('active', 'Enable the gateway?', true, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const ethereumName = process.env.ETHEREUM;
    const lineaName = process.env.LINEA;
    console.log(`Ethereum net name: ${ethereumName}`);
    console.log(`Linea net name: ${lineaName}`);

    let targetNetwork = taskArgs.targetNetwork;
    const active = taskArgs.active;
    console.log(`Enable the gateway? ${active}`);
    if (targetNetwork === lineaName) {
      console.log('Can not set for primary chain');
      return;
    }

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

    const arbitratorFactory = await hre.ethers.getContractFactory('Arbitrator');
    const adapterParams = '0x';
    const calldata = arbitratorFactory.interface.encodeFunctionData('setSecondaryChainGateway', [
      l1GatewayAddr,
      active,
      adapterParams,
    ]);
    console.log(`The setSecondaryChainGateway calldata: ${calldata}`);
  });
