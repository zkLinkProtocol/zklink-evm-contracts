const { providers, Wallet, utils } = require('ethers');
const { readDeployContract } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { task, types } = require('hardhat/config');

require('dotenv').config();

task('initConfig', 'Init config')
  .addParam('targetNetwork', 'L1 network name', undefined, types.string, false)
  .setAction(async (taskArgs, hre) => {
    let targetNetwork = taskArgs.targetNetwork;
    console.log('target network', targetNetwork);

    const walletPrivateKey = process.env.DEVNET_PRIVKEY;
    const l1Provider = new providers.JsonRpcProvider(process.env.L1RPC);
    const l2Provider = new providers.JsonRpcProvider(process.env.L2RPC);
    const scrollName = process.env.SCROLL;
    const l1Wallet = new Wallet(walletPrivateKey, l1Provider);
    const l2Wallet = new Wallet(walletPrivateKey, l2Provider);

    const l2WalletAddress = await l2Wallet.getAddress();
    const l2WalletBalance = utils.formatEther(await l2Wallet.getBalance());
    console.log(`${l2WalletAddress} balance on l2: ${l2WalletBalance} ether`);

    const zkLinkAddr = readDeployContract(
      logName.DEPLOY_ZKLINK_LOG_PREFIX,
      logName.DEPLOY_LOG_ZKLINK_PROXY,
      scrollName,
    );
    if (zkLinkAddr === undefined) {
      console.log('zkLink address not exist');
      return;
    }
    console.log(`The zkLink address: ${zkLinkAddr}`);

    const scrollL1GatewayAddr = readDeployContract(
      logName.DEPLOY_L1_GATEWAY_LOG_PREFIX,
      logName.DEPLOY_GATEWAY,
      scrollName + '_' + targetNetwork,
    );
    if (scrollL1GatewayAddr === undefined) {
      console.log('scroll l1 gateway address not exist');
      return;
    }
    console.log(`The scroll l1 gateway address: ${scrollL1GatewayAddr}`);

    const scrollL2GatewayAddr = readDeployContract(
      logName.DEPLOY_L2_GATEWAY_LOG_PREFIX,
      logName.DEPLOY_GATEWAY,
      scrollName,
    );
    if (scrollL2GatewayAddr === undefined) {
      console.log('scroll l2 gateway address not exist');
      return;
    }
    console.log(`The scroll l2 gateway address: ${scrollL2GatewayAddr}`);

    const scrollL1Gateway = await hre.ethers.getContractAt('ScrollL1Gateway', scrollL1GatewayAddr, l1Wallet);
    let tx = await scrollL1Gateway.setRemoteGateway(scrollL2GatewayAddr, { gasLimit: 1000000 });
    console.log(`The tx hash: ${tx.hash}`);
    console.log(`The scroll l1 gateway set remote gateway to ${scrollL2GatewayAddr}`);

    const scrollL2Gateway = await hre.ethers.getContractAt('ScrollL2Gateway', scrollL2GatewayAddr, l2Wallet);
    tx = await scrollL2Gateway.setRemoteGateway(scrollL1GatewayAddr, { gasLimit: 1000000, gasPrice: 100000000 });
    console.log(`The tx hash: ${tx.hash}`);
    console.log(`The scroll l2 gateway set remote gateway to ${scrollL1GatewayAddr}`);

    const zkLink = await hre.ethers.getContractAt('ZkLink', zkLinkAddr, l2Wallet);
    await zkLink.setGateway(scrollL2GatewayAddr, { gasLimit: 1000000, gasPrice: 100000000 });
    console.log(`The zkLink set gateway to ${scrollL2GatewayAddr}`);

    const gateway = await zkLink.gateway();
    console.log(`The gateway address: ${gateway}`);
  });
