const { JsonRpcProvider, Wallet, formatEther } = require('ethers');
const { readDeployContract } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { task, types } = require('hardhat/config');

require('dotenv').config();

task('syncL2Requests', 'Send sync point to arbitrator')
  .addOptionalParam('txs', 'New sync point', 100, types.int)
  .setAction(async (taskArgs, hre) => {
    const txs = taskArgs.txs;
    console.log(`The sync point: ${txs}`);

    const walletPrivateKey = process.env.DEVNET_PRIVKEY;
    const l2Provider = new JsonRpcProvider(process.env.L2RPC);
    const scrollName = process.env.SCROLL;
    const l2Wallet = new Wallet(walletPrivateKey, l2Provider);

    const l2WalletAddress = await l2Wallet.getAddress();
    const l2WalletBalance = formatEther(await l2Provider.getBalance(l2WalletAddress));
    console.log(`${l2WalletAddress} balance on l2: ${l2WalletBalance} ether`);

    const l2GatewayAddr = readDeployContract(logName.DEPLOY_L2_GATEWAY_LOG_PREFIX, logName.DEPLOY_GATEWAY, scrollName);
    if (l2GatewayAddr === undefined) {
      console.log('scroll l2 gateway address not exist');
      return;
    }
    console.log(`The scroll l2 gateway address: ${l2GatewayAddr}`);

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

    // send txs
    const zkLink = await hre.ethers.getContractAt('ZkLink', zkLinkAddr, l2Wallet);
    console.log(`Send a l2 message to l1...`);
    let tx = await zkLink.syncL2Requests(txs);
    console.log(`The tx hash: ${tx.hash}`);
    await tx.wait();
    console.log(`The tx confirmed`);
  });
