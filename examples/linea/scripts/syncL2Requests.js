const { JsonRpcProvider, Wallet, formatEther, parseEther } = require('ethers');
const { LineaSDK, OnChainMessageStatus } = require('@consensys/linea-sdk');
const { readDeployContract, getLogName } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { task, types } = require('hardhat/config');

require('dotenv').config();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

task('syncL2Requests', 'Send sync point to arbitrator')
  .addParam('value', 'Send msg value in ether', 0, types.string, true)
  .addParam('txs', 'New sync point', 100, types.int, true)
  .setAction(async (taskArgs, hre) => {
    const msgValue = taskArgs.value;
    const txs = taskArgs.txs;
    console.log(`The sync point: value: ${msgValue} ether, txs: ${txs}`);

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
    const lineaL1Contract = sdk.getL1Contract();
    const lineaL2Contract = sdk.getL2Contract();

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

    const l1GatewayLogName = getLogName(logName.DEPLOY_L1_GATEWAY_LOG_PREFIX, lineaName);
    const lineaL1GatewayAddr = readDeployContract(l1GatewayLogName, logName.DEPLOY_GATEWAY, ethereumName);
    if (lineaL1GatewayAddr === undefined) {
      console.log('linea l1 gateway address not exist');
      return;
    }
    console.log(`The linea l1 gateway address: ${lineaL1GatewayAddr}`);

    // Transfer ETH to ZKLink as a fee
    const minimumFee = await lineaL2Contract
      .getContract('0xC499a572640B64eA1C8c194c43Bc3E19940719dC', lineaL2Contract.signer)
      .minimumFeeInWei();
    console.log(`The minimum fee: ${formatEther(minimumFee.toBigInt())} ether`);
    await l2Wallet.sendTransaction({
      to: zkLinkAddr,
      value: minimumFee.toBigInt(),
    });
    console.log(`Transfer ${minimumFee.toBigInt()} ether to zkLink...`);

    // send tx
    const zkLink = await hre.ethers.getContractAt('ZkLink', zkLinkAddr, l2Wallet);
    console.log(`Send a l2 message to l1...`);
    let tx = await zkLink.syncL2Requests(txs, {
      value: parseEther(msgValue),
    });
    await tx.wait();
    console.log(`The tx hash: ${tx.hash}`);
    // const txHash = "0x0805ab212930572fd6d6d7fc101a078cf7561bde73ea769ac6e67b8a2b772321";

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
      const messageStatus = await lineaL1Contract.getMessageStatus(message.messageHash);
      console.log(`The message status: ${messageStatus}`);
      if (messageStatus === OnChainMessageStatus.CLAIMABLE) {
        const lineaL1Gateway = await hre.ethers.getContractAt('LineaL1Gateway', lineaL1GatewayAddr, l1Wallet);
        const tx = await lineaL1Gateway.claimMessage(
          message.value.toNumber(),
          message.calldata,
          message.messageNonce.toNumber(),
        );
        console.log(`The tx hash: ${tx.hash}`);
        const rec = await tx.wait();
        console.log(`The tx receipt: ${JSON.stringify(rec)}`);
        break;
      }
      await sleep(60 * 1000 * 30);
    }
    console.log('Done');

    // Example txs:
    // https://goerli.lineascan.build/tx/0x71ac2f88392b0045d0dd2e4eb657c875f7b076301b3ddb15e638e5856d7addd1
    //
  });
