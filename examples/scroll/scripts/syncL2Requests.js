const { JsonRpcProvider, Wallet, formatEther } = require('ethers');
const { readDeployContract } = require('../../../script/utils');
const { getL1MessagerContract } = require('./utils/utils');
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
    const scrollName = process.env.SCROLL;
    const l1Wallet = new Wallet(walletPrivateKey, l1Provider);
    const l2Wallet = new Wallet(walletPrivateKey, l2Provider);

    const l2WalletAddress = await l2Wallet.getAddress();
    const l2WalletBalance = formatEther(await l2Provider.getBalance(l2WalletAddress));
    console.log(`${l2WalletAddress} balance on l2: ${l2WalletBalance} ether`);

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

    // Wait for Scroll to package the transaction and poll for results via the following API.
    let claimInfo;

    /*eslint no-constant-condition: ["error", { "checkLoops": false }]*/
    while (true) {
      console.log('Polling for claimable...');
      claimInfo = await fetch(
        // There may be failures due to the network.
        `https://sepolia-api-bridge.scroll.io/api/claimable?page_size=10&page=1&address=${scrollL2GatewayAddr}`,
      )
        .then(
          response => {
            if (response.ok) {
              return response.json();
            }
            throw new Error('Request failed!');
          },
          networkError => {
            console.log(networkError.message);
          },
        )
        .then(resp => {
          const dataInfos = resp.data;
          if (dataInfos.total > 0) {
            for (let i = 0; i < dataInfos.total; i++) {
              const result = dataInfos.result.pop();
              return result.claimInfo;
            }
          }
        });
      if (claimInfo) {
        break;
      }
      await sleep(90 * 60 * 1000); // wait for Batch finalized
    }
    console.log(`The claimInfo: ${JSON.stringify(claimInfo)}`);

    const { l1Messager } = await getL1MessagerContract(hre, l1Wallet);
    console.log('L1 Messager Address:', await l1Messager.getAddress());

    /**
     * Now that its confirmed and not executed, we can execute our message in its outbox entry.
     */
    tx = await l1Messager.relayMessageWithProof(
      claimInfo.from,
      claimInfo.to,
      claimInfo.value,
      claimInfo.nonce,
      claimInfo.message,
      [claimInfo.batch_index, claimInfo.proof],
    );
    console.log(`The tx hash: ${tx.hash}`);
    const rec = await tx.wait();
    console.log('Done! Your transaction is executed', rec);

    // Example txs:
    // https://sepolia.scrollscan.com/tx/0xcbadd7ef4635821989200eacdb2d6e762d4995d39a71375d0c9bc70cf5eae1c5
    // https://sepolia.etherscan.io/tx/
  });
