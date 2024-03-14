const { Provider, Wallet } = require('zksync-ethers');
const { ethers } = require('ethers');
const { readDeployContract, getLogName } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { task, types } = require('hardhat/config');

require('dotenv').config();

task('syncL2Requests', 'Send sync point from zkLink to arbitrator')
  .addParam('txs', 'New sync point', 100, types.int, true)
  .setAction(async (taskArgs, hre) => {
    const txs = taskArgs.txs;
    console.log(`The sync point: ${txs}`);

    const walletPrivateKey = process.env.DEVNET_PRIVKEY;
    const l1Provider = new Provider(process.env.L1RPC);
    console.log(`Block number: ${await l1Provider.getBlockNumber()}`);

    const l2Provider = new Provider(process.env.L2RPC);
    console.log(`Block number: ${await l2Provider.getBlockNumber()}`);

    const zksyncName = process.env.ZKSYNC;
    const ethereumName = process.env.ETHEREUM;
    const l1Wallet = new ethers.Wallet(walletPrivateKey, l1Provider);
    const l2Wallet = new Wallet(walletPrivateKey, l2Provider, l1Provider);

    const l2WalletAddress = await l2Wallet.getAddress();
    const l2WalletBalance = ethers.formatEther(await l2Wallet.getBalance());
    console.log(`${l2WalletAddress} balance on l2: ${l2WalletBalance} ether`);

    const zkLinkAddr = readDeployContract(
      logName.DEPLOY_ZKLINK_LOG_PREFIX,
      logName.DEPLOY_LOG_ZKLINK_PROXY,
      zksyncName,
    );
    if (zkLinkAddr === undefined) {
      console.log('zkLink address not exist');
      return;
    }
    console.log(`The zkLink address: ${zkLinkAddr}`);

    const l1GatewayLogName = getLogName(logName.DEPLOY_L1_GATEWAY_LOG_PREFIX, zksyncName);
    const l1GatewayAddr = readDeployContract(l1GatewayLogName, logName.DEPLOY_GATEWAY, ethereumName);
    if (l1GatewayAddr === undefined) {
      console.log('l1 gateway address not exist');
      return;
    }
    console.log(`The l1 gateway address: ${l1GatewayAddr}`);

    const zkLink = await hre.ethers.getContractAt('DummyZkLink', zkLinkAddr, l2Wallet);
    console.log(`Send a l2 message to l1...`);
    const l2Tx = await zkLink.syncL2Requests(txs);
    const txHash = l2Tx.hash;
    console.log(`The l2 tx hash: ${txHash}`);
    // const txHash = "0x4948b5b62d415eca82629e9043bbcada07abeabc5f1a91bfbca664ce7bf3e046"
    const txHandle = await l2Provider.getTransaction(txHash);
    await txHandle.wait();

    // waiting to finalize can take a few minutes.
    await txHandle.waitFinalize();

    const withdrawalParams = await l2Wallet.finalizeWithdrawalParams(txHash);
    console.log('L1 Batch for block :>> ', withdrawalParams.l1BatchNumber);
    console.log('L2 message index :>> ', withdrawalParams.l2MessageIndex);
    console.log('L1 Index for Tx in block :>> ', withdrawalParams.l2TxNumberInBlock);
    console.log('L2 to L1 message :>> ', withdrawalParams.message);
    console.log('Proof :>> ', withdrawalParams.proof);

    /**
     * Now that its confirmed and not executed, we can execute our message in its outbox entry.
     */
    const l1Gateway = await hre.ethers.getContractAt('ZkSyncL1Gateway', l1GatewayAddr, l1Wallet);
    const l1Tx = await l1Gateway.finalizeMessage(
      withdrawalParams.l1BatchNumber,
      withdrawalParams.l2MessageIndex,
      withdrawalParams.l2TxNumberInBlock,
      withdrawalParams.message,
      withdrawalParams.proof,
    );
    const l1Receipt = await l1Tx.wait();
    console.log('Done! Your transaction is executed', l1Receipt);

    /** Example Txs
     * https://sepolia.explorer.zksync.io/tx/0x4948b5b62d415eca82629e9043bbcada07abeabc5f1a91bfbca664ce7bf3e046
     * https://sepolia.etherscan.io/tx/0x61044b2b88c2947010917f7c57b5bd43123bc6824e9a2215e6622d6f88d9320b
     */
  });
