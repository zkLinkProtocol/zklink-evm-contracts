// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require('hardhat');
const { providers, Wallet } = require('ethers');
const { readDeployContract } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { L2TransactionReceipt, L2ToL1MessageStatus } = require('@arbitrum/sdk');

require('dotenv').config();

async function main() {
  const walletPrivateKey = process.env.DEVNET_PRIVKEY;
  const l1Provider = new providers.JsonRpcProvider(process.env.L1RPC);
  const l2Provider = new providers.JsonRpcProvider(process.env.L2RPC);
  const arbitrumName = process.env.ARBITRUM;
  const l1Wallet = new Wallet(walletPrivateKey, l1Provider);
  const l2Wallet = new Wallet(walletPrivateKey, l2Provider);

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

  const zkLink = await hre.ethers.getContractAt('ZkLink', zkLinkAddr, l2Wallet);
  const newTotalSyncedPriorityTxs = 100;
  console.log(`Send a l2 message to l1...`);
  const tx = await zkLink.syncL2Requests(newTotalSyncedPriorityTxs);
  await tx.wait();
  const txHash = tx.hash;
  console.log(`The tx hash: ${tx.hash}`);

  /**
   * First, let's find the Arbitrum txn from the txn hash provided
   */
  const receipt = await l2Provider.getTransactionReceipt(txHash);
  const l2Receipt = new L2TransactionReceipt(receipt);

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
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
