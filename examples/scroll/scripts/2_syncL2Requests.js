const { providers, Wallet, utils } = require('ethers');
const { readDeployContract } = require('../../../script/utils');
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
    const l1Provider = new providers.JsonRpcProvider(process.env.L1RPC);
    const l2Provider = new providers.JsonRpcProvider(process.env.L2RPC);
    const scrollName = process.env.SCROLL;
    const l1Wallet = new Wallet(walletPrivateKey, l1Provider);
    const l2Wallet = new Wallet(walletPrivateKey, l2Provider);

    const l2WalletAddress = await l2Wallet.getAddress();
    const l2WalletBalance = utils.formatEther(await l2Wallet.getBalance());
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
    let tx = await zkLink.syncL2Requests(txs, { value: utils.parseEther(msgValue), gasLimit: 1000000, gasPrice: 100000000 });
    await tx.wait();
    console.log(`The tx hash: ${tx.hash}`);

    // Wait for Scroll to package the transaction and poll for results via the following API.
    let claimInfo;
    while (true) {
      console.log('Polling for claimable...');
      claimInfo = await fetch(`https://sepolia-api-bridge.scroll.io/api/claimable?page_size=10&page=1&address=${scrollL2GatewayAddr}`).then(response => {
        if (response.ok) {
          return response.json();
        }
        throw new Error('Request failed!');
      }, networkError => {
        console.log(networkError.message);
      }).then(resp => {
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
      await sleep(60 * 60 * 1000);
    }
    console.log(`The claimInfo: ${JSON.stringify(claimInfo)}`);

    const abi = [{ "inputs": [{ "internalType": "address", "name": "_from", "type": "address" }, { "internalType": "address", "name": "_to", "type": "address" }, { "internalType": "uint256", "name": "_value", "type": "uint256" }, { "internalType": "uint256", "name": "_nonce", "type": "uint256" }, { "internalType": "bytes", "name": "_message", "type": "bytes" }, { "components": [{ "internalType": "uint256", "name": "batchIndex", "type": "uint256" }, { "internalType": "bytes", "name": "merkleProof", "type": "bytes" }], "internalType": "struct IL1ScrollMessenger.L2MessageProof", "name": "_proof", "type": "tuple" }], "name": "relayMessageWithProof", "outputs": [], "stateMutability": "nonpayable", "type": "function" }]

    const l1Messager = await hre.ethers.getContractAt(abi, "0x50c7d3e7f7c656493D1D76aaa1a836CedfCBB16A", l1Wallet);
    console.log("L1 Messager:", l1Messager.address);

    /**
    * Now that its confirmed and not executed, we can execute our message in its outbox entry.
    */
    tx = await l1Messager.relayMessageWithProof(claimInfo.from, claimInfo.to, claimInfo.value, claimInfo.nonce, claimInfo.message, [claimInfo.batch_index, claimInfo.proof], { gasLimit: 1000000 });
    console.log(`The tx hash: ${tx.hash}`);
    const rec = await tx.wait();
    console.log('Done! Your transaction is executed', rec);
  });
