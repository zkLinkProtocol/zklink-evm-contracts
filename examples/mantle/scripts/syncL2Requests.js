const mantle = require('@mantleio/sdk');
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
    const mantleName = process.env.MANTLE;
    const l1Wallet = new ethers.Wallet(walletPrivateKey, l1Provider);
    const l2Wallet = new ethers.Wallet(walletPrivateKey, l2Provider);
    const messenger = new mantle.CrossChainMessenger({
      l1ChainId: ethereumName !== 'ETHEREUM' ? 5 : 1, // 5 for Goerli, 1 for Ethereum
      l2ChainId: ethereumName !== 'ETHEREUM' ? 5001 : 5000, // 5001 for Mantle Testnet, 5000 for Mantle Mainnet
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
    console.log(`Send a l2 message to l1...`);
    let tx = await zkLink.syncL2Requests(txs);
    let txHash = tx.hash;
    console.log(`The tx hash: ${txHash}`);
    await tx.wait();
    console.log(`The transaction has been executed on L2`);

    /**
     * Wait until the message is ready for relay
     */
    await messenger.waitForMessageStatus(txHash, mantle.MessageStatus.READY_FOR_RELAY);
    /**
     * Relay the message on L1
     * Finalizes a cross chain message that was sent from L2 to L1. Only applicable for L2 to L1 messages. Will throw an error if the message has not completed its challenge period yet.
     */
    await messenger.finalizeMessage(txHash);

    // Waiting for the official mantle bridge to forward the message to L2
    const rec = await messenger.waitForMessageReceipt(txHash);
    console.log(`The tx receipt: ${JSON.stringify(rec, null, 2)}`);
    console.log('Done! Your transaction is executed');

    // Example txs:
    // https://explorer.testnet.mantle.xyz/tx/0xb181480c55d230963ddd19e72e2f24edb6e14ee1616febbef5eb9324af848617
    // https://goerli.etherscan.io/tx/0x866fb187ea541cae276d85964e0c386fb9b1149b2b7c8bb881c3ae3cc360e944
  });
