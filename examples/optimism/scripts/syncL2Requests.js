const optimism = require('@eth-optimism/sdk');
const ethers = require('ethers');
const { readDeployContract } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { task, types } = require('hardhat/config');

require('dotenv').config();

task('syncL2Requests', 'Send sync point to arbitrator')
  .addParam('txs', 'New sync point', 100, types.int, true)
  .setAction(async (taskArgs, hre) => {
    const txs = taskArgs.txs;
    console.log(`The sync point: txs: ${txs}`);

    const walletPrivateKey = process.env.DEVNET_PRIVKEY;
    const l1Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L1RPC);
    const l2Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L2RPC);
    const optimismName = process.env.OPTIMISM;
    const ethereumName = process.env.ETHEREUM;
    const l1Wallet = new ethers.Wallet(walletPrivateKey, l1Provider);
    const l2Wallet = new ethers.Wallet(walletPrivateKey, l2Provider);
    const messenger = new optimism.CrossChainMessenger({
      l1ChainId: ethereumName !== 'ETHEREUM' ? 11155111 : 1, // 11155111 for Sepolia, 1 for Ethereum
      l2ChainId: ethereumName !== 'ETHEREUM' ? 11155420 : 10, // 11155420 for OP Sepolia, 10 for OP Mainnet
      l1SignerOrProvider: l1Wallet,
      l2SignerOrProvider: l2Wallet,
    });

    const l2WalletAddress = await l2Wallet.getAddress();
    const l2WalletBalance = ethers.utils.formatEther(await l2Wallet.getBalance());
    console.log(`${l2WalletAddress} balance on l2: ${l2WalletBalance} ether`);

    const optimismL2GatewayAddr = readDeployContract(
      logName.DEPLOY_L2_GATEWAY_LOG_PREFIX,
      logName.DEPLOY_GATEWAY,
      optimismName,
    );
    if (optimismL2GatewayAddr === undefined) {
      console.log('optimism l2 gateway address not exist');
      return;
    }
    console.log(`The optimism l2 gateway address: ${optimismL2GatewayAddr}`);

    const zkLinkAddr = readDeployContract(
      logName.DEPLOY_ZKLINK_LOG_PREFIX,
      logName.DEPLOY_LOG_ZKLINK_PROXY,
      optimismName,
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
    let txHash = tx.hash;
    await tx.wait();
    console.log(`The tx hash: ${txHash}`);

    /**
     * Wait until the message is ready to prove
     * This step can take a few minutes.
     */
    await messenger.waitForMessageStatus(txHash, optimism.MessageStatus.READY_TO_PROVE);
    /**
     * Once the message is ready to be proven, you'll send an L1 transaction to prove that the message was sent on L2.
     */
    await messenger.proveMessage(txHash);
    /**
     * Wait until the message is ready for relay
     * The final step to sending messages from L2 to L1 is to relay the messages on L1. This can only happen after the fault proof period has elapsed. On OP Sepolia, this is only a few seconds. On OP Mainnet, this takes 7 days.
     */
    await messenger.waitForMessageStatus(txHash, optimism.MessageStatus.READY_FOR_RELAY);
    /**
     * Relay the message on L1
     * Once the withdrawal is ready to be relayed you can finally complete the message sending process.
     */
    await messenger.finalizeMessage(txHash);
    /**
     * Wait until the message is relayed
     * Now you simply wait until the message is relayed.
     */
    await messenger.waitForMessageStatus(txHash, optimism.MessageStatus.RELAYED);
    const message = (await messenger.getMessagesByTransaction(txHash)).pop();
    // Waiting for the official optimism bridge to forward the message to L2
    const rec = await messenger.waitForMessageReceipt(message);
    console.log(`The tx receipt: ${JSON.stringify(rec)}`);
    console.log('Done! Your transaction is executed');

    // Example txs:
    // https://sepolia-optimistic.etherscan.io/tx/0xd1be4141ad192ddb978bfb324aaa41c2bddfdabce159de710e658db98d7c6885
    // https://sepolia.etherscan.io/tx/0x18be026ceed349625363f84a75c0384e69c549a972d79e78f327c2a1647a183d
  });
