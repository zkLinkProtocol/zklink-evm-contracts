const { JsonRpcProvider, Wallet, formatEther } = require('ethers');
const { readDeployContract, getLogName } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { task, types } = require('hardhat/config');
const { claimL1ToL2Message } = require('./common');

require('dotenv').config();

task('setValidator', 'Set validator for zkLink')
  .addParam('validator', 'Validator Address', undefined, types.string)
  .addOptionalParam('active', 'Whether to activate the validator address', true, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const validatorAddr = taskArgs.validator;
    const isActive = taskArgs.active;
    console.log(`The validator: address: ${validatorAddr}, active: ${isActive}`);

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

    // forward message to L2
    const arbitrator = await hre.ethers.getContractAt('Arbitrator', arbitratorAddr, l1Wallet);
    const adapterParams = '0x';
    let tx = await arbitrator.setValidator(lineaL1GatewayAddr, validatorAddr, isActive, adapterParams);
    console.log(`The l1 tx hash: ${tx.hash}`);
    await tx.wait();
    console.log(`The l1 tx confirmed`);
    await claimL1ToL2Message(tx.hash);
  });
