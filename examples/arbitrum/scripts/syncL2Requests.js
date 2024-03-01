const { providers, Wallet, utils } = require('ethers');
const { readDeployContract } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { L2TransactionReceipt, L2ToL1MessageStatus } = require('@arbitrum/sdk');
const { task, types } = require('hardhat/config');

require('dotenv').config();

task('syncL2Requests', 'Send sync point from zkLink to arbitrator')
  .addParam('txs', 'New sync point', 100, types.int, true)
  .setAction(async (taskArgs, hre) => {
    const txs = taskArgs.txs;
    console.log(`The sync point: ${txs}`);

    const walletPrivateKey = process.env.DEVNET_PRIVKEY;
    const l1Provider = new providers.JsonRpcProvider(process.env.L1RPC);
    const l2Provider = new providers.JsonRpcProvider(process.env.L2RPC);
    const arbitrumName = process.env.ARBITRUM;
    const l1Wallet = new Wallet(walletPrivateKey, l1Provider);
    const l2Wallet = new Wallet(walletPrivateKey, l2Provider);

    const l2WalletAddress = await l2Wallet.getAddress();
    const l2WalletBalance = utils.formatEther(await l2Wallet.getBalance());
    console.log(`${l2WalletAddress} balance on l2: ${l2WalletBalance} ether`);

    const zkLinkAddr = readDeployContract(
      logName.DEPLOY_ZKLINK_LOG_PREFIX,
      logName.DEPLOY_LOG_ZKLINK_PROXY,
      arbitrumName,
    );
    if (zkLinkAddr === undefined) {
      console.log('zkLink address not exist');
      return;
    }
    console.log(`The zkLink address: ${zkLinkAddr}`);

    const zkLink = await hre.ethers.getContractAt('DummyZkLink', zkLinkAddr, l2Wallet);
    console.log(`Send a l2 message to l1...`);
    const l2Tx = await zkLink.syncL2Requests(txs);
    const txHash = l2Tx.hash;
    console.log(`The l2 tx hash: ${txHash}`);
    const syncL2RequestsReceipt = await l2Tx.wait();

    /**
     * First, let's find the Arbitrum txn from the txn hash provided
     */
    const l2Receipt = new L2TransactionReceipt(syncL2RequestsReceipt);

    /**
     * Note that in principle, a single transaction could trigger any number of outgoing messages; the common case will be there's only one.
     * For the sake of this script, we assume there's only one / just grad the first one.
     */
    const messages = await l2Receipt.getL2ToL1Messages(l1Wallet);
    const l2ToL1Msg = messages[0];

    /**
     * Check if already executed
     */
    const msgStatus = await l2ToL1Msg.status(l2Provider);
    console.log(`Message status: ${msgStatus}`);
    if ((await l2ToL1Msg.status(l2Provider)) === L2ToL1MessageStatus.EXECUTED) {
      console.log(`Message already executed! Nothing else to do here`);
      return;
    }

    /**
     * before we try to execute out message, we need to make sure the l2 block it's included in is confirmed! (It can only be confirmed after the dispute period; Arbitrum is an optimistic rollup after-all)
     * waitUntilReadyToExecute() waits until the item outbox entry exists
     */
    const timeToWaitMs = 1000 * 60;
    console.log(
      "Waiting for the outbox entry to be created. This only happens when the L2 block is confirmed on L1, ~1 week after it's creation.",
    );
    await l2ToL1Msg.waitUntilReadyToExecute(l2Provider, timeToWaitMs);
    console.log('Outbox entry exists! Trying to execute now');

    /**
     * Now that its confirmed and not executed, we can execute our message in its outbox entry.
     */
    const res = await l2ToL1Msg.execute(l2Provider);
    const rec = await res.wait();
    console.log('Done! Your transaction is executed', rec);
  });
