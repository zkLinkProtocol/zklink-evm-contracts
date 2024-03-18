const base = require('@eth-optimism/sdk');
const ethers = require('ethers');
const { readDeployContract } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { L1_MAINNET_CONTRACTS, L1_TESTNET_CONTRACTS } = require('./constants');
const { task, types } = require('hardhat/config');

require('dotenv').config();
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

task('syncL2Requests', 'Send sync point to arbitrator')
  .addParam('txs', 'New sync point', 100, types.int, true)
  .setAction(async (taskArgs, hre) => {
    const txs = taskArgs.txs;
    console.log(`The sync point: txs: ${txs}`);

    const walletPrivateKey = process.env.DEVNET_PRIVKEY;
    const l1Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L1RPC);
    const l2Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L2RPC);
    const baseName = process.env.BASE;
    const ethereumName = process.env.ETHEREUM;
    const l1Wallet = new ethers.Wallet(walletPrivateKey, l1Provider);
    const l2Wallet = new ethers.Wallet(walletPrivateKey, l2Provider);

    const messengerL1Contracts = ethereumName !== 'ETHEREUM' ? L1_TESTNET_CONTRACTS : L1_MAINNET_CONTRACTS;
    const messenger = new base.CrossChainMessenger({
      l1ChainId: await l1Wallet.getChainId(), // 11155111 for Sepolia, 1 for Ethereum
      l2ChainId: await l2Wallet.getChainId(), // 84532 for Base Sepolia, 8453 for Base Mainnet
      l1SignerOrProvider: l1Wallet,
      l2SignerOrProvider: l2Wallet,
      bedrock: true,
      contracts: {
        l1: messengerL1Contracts,
      },
    });

    const l2WalletAddress = await l2Wallet.getAddress();
    const l2WalletBalance = ethers.utils.formatEther(await l2Wallet.getBalance());
    console.log(`${l2WalletAddress} balance on l2: ${l2WalletBalance} ether`);

    const baseL2GatewayAddr = readDeployContract(
      logName.DEPLOY_L2_GATEWAY_LOG_PREFIX,
      logName.DEPLOY_GATEWAY,
      baseName,
    );
    if (baseL2GatewayAddr === undefined) {
      console.log('base l2 gateway address not exist');
      return;
    }
    console.log(`The base l2 gateway address: ${baseL2GatewayAddr}`);

    const zkLinkAddr = readDeployContract(logName.DEPLOY_ZKLINK_LOG_PREFIX, logName.DEPLOY_LOG_ZKLINK_PROXY, baseName);
    if (zkLinkAddr === undefined) {
      console.log('zkLink address not exist');
      return;
    }
    console.log(`The zkLink address: ${zkLinkAddr}`);

    // send txs
    const zkLink = await hre.ethers.getContractAt('ZkLink', zkLinkAddr, l2Wallet);
    const executeCalldata = zkLink.interface.encodeFunctionData('syncL2Requests', [txs]);
    const gasLimit = await l2Provider.estimateGas({
      to: zkLinkAddr,
      data: executeCalldata,
      from: l2WalletAddress,
    });
    console.log(`The gas limit: ${gasLimit}`);

    console.log(`Send a l2 message to l1...`);
    let tx = await zkLink.syncL2Requests(txs, {
      gasLimit: gasLimit,
    });
    let txHash = tx.hash;
    console.log(`The tx hash: ${txHash}`);
    await tx.wait();
    console.log(`The transaction has been executed on L2`);
    // txHash = "0x1a81ed28c1b74120753b0edf3d98e80b814ec5f065ad44b26c0cd6131dc04d22"
    let status = await messenger.getMessageStatus(txHash);
    console.log(`The message status update to: ${base.MessageStatus[status]}`);

    /**
     * Wait until the message is ready to prove
     * This step takes about 45 minutes.
     */
    await messenger.waitForMessageStatus(txHash, base.MessageStatus.READY_TO_PROVE);
    /**
     * Once the message is ready to be proven, you'll send an L1 transaction to prove that the message was sent on L2.
     */
    console.log(`Proving the message...`);
    tx = await messenger.proveMessage(txHash);
    console.log(`The prove tx hash: ${tx.hash}`);
    await tx.wait();
    console.log(`The message has been proven`);
    status = await messenger.getMessageStatus(txHash);
    console.log(`The message status update to: ${base.MessageStatus[status]}`);
    /**
     * Wait until the message is ready for relay
     * The final step to sending messages from L2 to L1 is to relay the messages on L1. This can only happen after the fault proof period has elapsed. On OP Sepolia, this is only a few seconds. On OP Mainnet, this takes 7 days.
     * Basae is same way as Optimism
     */
    await messenger.waitForMessageStatus(txHash, base.MessageStatus.READY_FOR_RELAY);
    console.log(`The message is ready for relay`);
    status = await messenger.getMessageStatus(txHash);
    console.log(`The message status update to: ${base.MessageStatus[status]}`);
    await sleep(12 * 1000); // 12 seconds, Waiting for a block to ensure the PROVE transaction is on the chain
    /**
     * Relay the message on L1
     * Once the withdrawal is ready to be relayed you can finally complete the message sending process.
     */
    console.log(`Relaying the message...`);
    tx = await messenger.finalizeMessage(txHash);
    console.log(`The relay tx hash: ${tx.hash}`);
    await tx.wait();
    console.log(`The message has been relayed`);
    status = await messenger.getMessageStatus(txHash);
    console.log(`The message status update to: ${base.MessageStatus[status]}`);
    /**
     * Wait until the message is relayed
     * Now you simply wait until the message is relayed.
     */
    // Waiting for the official base bridge to forward the message to L2
    const rec = await messenger.waitForMessageReceipt(txHash);
    console.log(`The tx receipt: ${JSON.stringify(rec, null, 2)}`);
    console.log('Done!');

    // Example txs:
    // https://sepolia.basescan.org/tx/0x5ae6195c0b103bee7fbfb855bf23e9afde809ea2527fa9b0209c63038627959b
    // https://sepolia.etherscan.io/tx/0xb1b968732830a8c0481cecf0a85fdcb3950b2841819154ab4e366c3ee7770834
  });
