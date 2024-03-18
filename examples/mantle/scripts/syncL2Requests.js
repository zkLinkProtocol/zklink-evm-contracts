const mantle = require('@mantleio/sdk');
const ethers = require('ethers');
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
    console.log(`The sync point: txs: ${txs}`);

    const walletPrivateKey = process.env.DEVNET_PRIVKEY;
    const l1Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L1RPC);
    const l2Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L2RPC);
    const mantleName = process.env.MANTLE;
    const l1Wallet = new ethers.Wallet(walletPrivateKey, l1Provider);
    const l2Wallet = new ethers.Wallet(walletPrivateKey, l2Provider);
    const messenger = new mantle.CrossChainMessenger({
      l1ChainId: await l1Wallet.getChainId(), // 5 for Goerli, 1 for Ethereum
      l2ChainId: await l2Wallet.getChainId(), // 5003 for Mantle Testnet, 5000 for Mantle Mainnet
      l1SignerOrProvider: l1Wallet,
      l2SignerOrProvider: l2Wallet,
      bedrock: true,
    });

    const l2WalletAddress = await l2Wallet.getAddress();
    const l2WalletBalance = ethers.utils.formatEther(await l2Wallet.getBalance());
    console.log(`${l2WalletAddress} balance on l2: ${l2WalletBalance} $MNT`);

    const mantleL2GatewayAddr = readDeployContract(
      logName.DEPLOY_L2_GATEWAY_LOG_PREFIX,
      logName.DEPLOY_GATEWAY,
      mantleName,
    );
    if (mantleL2GatewayAddr === undefined) {
      console.log('mantle l2 gateway address not exist');
      return;
    }
    console.log(`The mantle l2 gateway address: ${mantleL2GatewayAddr}`);

    const zkLinkAddr = readDeployContract(
      logName.DEPLOY_ZKLINK_LOG_PREFIX,
      logName.DEPLOY_LOG_ZKLINK_PROXY,
      mantleName,
    );
    if (zkLinkAddr === undefined) {
      console.log('zkLink address not exist');
      return;
    }
    console.log(`The zkLink address: ${zkLinkAddr}`);

    // send txs
    const zkLink = await hre.ethers.getContractAt('ZkLink', zkLinkAddr, l2Wallet);
    const calldata = zkLink.interface.encodeFunctionData('syncL2Requests', [txs]);
    console.log(`The calldata: ${calldata}`);
    const gasLimit = await l2Provider.estimateGas({
      from: l2WalletAddress,
      to: zkLinkAddr,
      data: calldata,
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
    // const txHash = "0x1722982cdee99d178047b8a64d15b90ac9df26da0571938a6c6a37e9025e7266";

    /**
     * Wait until the message is ready to prove
     * This step takes about 30 minutes.
     */
    await messenger.waitForMessageStatus(txHash, mantle.MessageStatus.READY_TO_PROVE);
    /**
     * Once the message is ready to be proven, you'll send an L1 transaction to prove that the message was sent on L2.
     */
    console.log(`Proving the message...`);
    tx = await messenger.proveMessage(txHash);
    console.log(`The prove tx hash: ${tx.hash}`);
    await tx.wait();
    console.log(`The message has been proven`);
    sleep(12 * 1000); // sleep 12 seconds

    /**
     * Wait until the message is ready for relay
     */
    await messenger.waitForMessageStatus(txHash, mantle.MessageStatus.READY_FOR_RELAY);
    /**
     * Relay the message on L1
     * Finalizes a cross chain message that was sent from L2 to L1. Only applicable for L2 to L1 messages. Will throw an error if the message has not completed its challenge period yet.
     */
    tx = await messenger.finalizeMessage(txHash);
    console.log(`The finalize tx hash: ${tx.hash}`);
    await tx.wait();
    console.log(`The message has been finalized`);

    // Waiting for the official mantle bridge to forward the message to L2
    const rec = await messenger.waitForMessageReceipt(txHash);
    console.log(`The tx receipt: ${JSON.stringify(rec, null, 2)}`);
    console.log('Done! Your transaction is executed');

    // Example txs:
    // https://explorer.sepolia.mantle.xyz/tx/0x1722982cdee99d178047b8a64d15b90ac9df26da0571938a6c6a37e9025e7266
    // https://sepolia.etherscan.io/tx/0xf500ffa344a60868a4935f496f741840161b24b99175f7b31325b7cfd049c47a
  });
