const { JsonRpcProvider, Wallet, formatEther } = require('ethers');
const { LineaSDK, OnChainMessageStatus } = require('@consensys/linea-sdk');
const { readDeployContract } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { task, types } = require('hardhat/config');

require('dotenv').config();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

task('syncL2Requests', 'Send sync point to arbitrator')
  .addParam('txs', 'New sync point', 100, types.int, true)
  .setAction(async (taskArgs, hre) => {
    const txs = taskArgs.txs;
    console.log(`The sync point: ${txs}`);

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
      network: ethereumName === 'GOERLI' ? 'linea-goerli' : 'linea-mainnet',
      mode: 'read-write',
    });
    const lineaL2Contract = sdk.getL2Contract();
    const lineaL1ClaimingService = sdk.getL1ClaimingService();

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
    const minimumFee = await lineaL2Contract
      .getContract(l2MessageServiceAddress, lineaL2Contract.signer)
      .minimumFeeInWei();
    console.log(`The minimum fee: ${formatEther(minimumFee.toBigInt())} ether`);

    // send tx
    const zkLink = await hre.ethers.getContractAt('DummyZkLink', zkLinkAddr, l2Wallet);
    console.log(`Send a l2 message to l1...`);
    let tx = await zkLink.syncL2Requests(txs, {
      value: minimumFee.toBigInt(),
    });
    console.log(`The tx hash: ${tx.hash}`);
    await tx.wait();
    console.log(`The tx confirmed`);

    /**
     * Query the message informations on L2 via txHash.
     */
    const message = (await lineaL2Contract.getMessagesByTransactionHash(tx.hash)).pop();
    console.log(`The messageSender: ${message.messageSender}`);
    console.log(`The destination: ${message.destination}`);
    console.log(`The fee: ${message.fee}`);
    console.log(`The value: ${message.value}`);
    console.log(`The messageNonce: ${message.messageNonce}`);
    console.log(`The calldata: ${message.calldata}`);
    console.log(`The messageHash: ${message.messageHash}`);

    // Waiting for the official Linea bridge to forward the message to L1
    // And manually claim the message on L1
    /*eslint no-constant-condition: ["error", { "checkLoops": false }]*/
    while (true) {
      /**
       * Query the transaction status on L1 via messageHash.
       */
      const messageStatus = await lineaL1ClaimingService.getMessageStatus(message.messageHash);
      console.log(`The message status: ${messageStatus}`);
      if (messageStatus === OnChainMessageStatus.CLAIMABLE) {
        const tx = await lineaL1ClaimingService.claimMessage(message);
        console.log(`The tx hash: ${tx.hash}`);
        await tx.wait();
        console.log(`The tx confirmed}`);
        break;
      }
      await sleep(60 * 1000 * 30);
    }
    console.log('Done');

    // Example txs:
    // https://goerli.lineascan.build/tx/0x71ac2f88392b0045d0dd2e4eb657c875f7b076301b3ddb15e638e5856d7addd1
    //
  });
