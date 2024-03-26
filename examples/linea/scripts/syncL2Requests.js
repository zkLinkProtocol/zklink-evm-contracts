const { JsonRpcProvider, Wallet, formatEther } = require('ethers');
const { L2MessageServiceContract } = require('@consensys/linea-sdk');
const { readDeployContract } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { task, types } = require('hardhat/config');
const { claimL2ToL1Message } = require('./common');

require('dotenv').config();

task('syncL2Requests', 'Send sync point to arbitrator')
  .addParam('txs', 'New sync point', 100, types.int, true)
  .setAction(async (taskArgs, hre) => {
    const txs = taskArgs.txs;
    console.log(`The sync point: ${txs}`);

    const walletPrivateKey = process.env.DEVNET_PRIVKEY;
    const l1Provider = new JsonRpcProvider(process.env.L1RPC);
    const l2Provider = new JsonRpcProvider(process.env.L2RPC);
    const lineaName = process.env.LINEA;
    const l1Wallet = new Wallet(walletPrivateKey, l1Provider);
    const l2Wallet = new Wallet(walletPrivateKey, l2Provider);

    const l1WalletAddress = await l1Wallet.getAddress();
    const l1WalletBalance = formatEther(await l1Provider.getBalance(l1WalletAddress));
    console.log(`${l1WalletAddress} balance on l1: ${l1WalletBalance} ether`);
    const l2WalletAddress = await l2Wallet.getAddress();
    const l2WalletBalance = formatEther(await l2Provider.getBalance(l2WalletAddress));
    console.log(`${l2WalletAddress} balance on l2: ${l2WalletBalance} ether`);

    const zkLinkAddr = readDeployContract(logName.DEPLOY_ZKLINK_LOG_PREFIX, logName.DEPLOY_LOG_ZKLINK_PROXY, lineaName);
    if (zkLinkAddr === undefined) {
      console.log('zkLink address not exist');
      return;
    }
    console.log(`The zkLink address: ${zkLinkAddr}`);

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
    const l2Gateway = await hre.ethers.getContractAt('LineaL2Gateway', lineaL2GatewayAddr, l2Wallet);
    const l2MessageServiceAddress = await l2Gateway.MESSAGE_SERVICE();

    // Transfer ETH to ZKLink as a fee
    const minimumFee = await L2MessageServiceContract.getContract(
      l2MessageServiceAddress,
      l2Provider,
    ).minimumFeeInWei();
    console.log(`The minimum fee: ${formatEther(minimumFee.toBigInt())} ether`);

    // send tx
    const zkLink = await hre.ethers.getContractAt('DummyZkLink', zkLinkAddr, l2Wallet);
    console.log(`Send a l2 message to l1...`);
    let tx = await zkLink.syncL2Requests(txs, {
      value: minimumFee.toBigInt(),
    });
    console.log(`The l2 tx hash: ${tx.hash}`);
    await tx.wait();
    console.log(`The l2 tx confirmed`);
    await claimL2ToL1Message(tx.hash);

    // Example txs:
    // https://goerli.lineascan.build/tx/0x71ac2f88392b0045d0dd2e4eb657c875f7b076301b3ddb15e638e5856d7addd1
    //
  });
