const manta = require('@eth-optimism/sdk');
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
    const mantaName = process.env.MANTA;
    const l1Wallet = new ethers.Wallet(walletPrivateKey, l1Provider);
    const l2Wallet = new ethers.Wallet(walletPrivateKey, l2Provider);
    const messenger = new manta.CrossChainMessenger({
      l1ChainId: 5, // 5 for Goerli, 1 for Ethereum
      l2ChainId: 3441005, // 3441005 for Manta Pacific Testnet, 169 for Manta Pacific Mainnet
      l1SignerOrProvider: l1Wallet,
      l2SignerOrProvider: l2Wallet,
      bedrock: true,
      contracts: {
        l1: {
          StateCommitmentChain: '0x0000000000000000000000000000000000000000',
          BondManager: '0x0000000000000000000000000000000000000000',
          CanonicalTransactionChain: '0x0000000000000000000000000000000000000000',
          AddressManager: '0x0AaeDFF2961D05021832cA093cf9409eDF5ECa8C',
          L1CrossDomainMessenger: '0x7Ad11bB9216BC9Dc4CBd488D7618CbFD433d1E75',
          L1StandardBridge: '0x4638aC6b5727a8b9586D3eba5B44Be4b74ED41Fc',
          OptimismPortal: '0x7FD7eEA37c53ABf356cc80e71144D62CD8aF27d3',
          L2OutputOracle: '0x8553D4d201ef97F2b76A28F5E543701b25e55B1b',
        },
      },
    });

    const l2WalletAddress = await l2Wallet.getAddress();
    const l2WalletBalance = ethers.utils.formatEther(await l2Wallet.getBalance());
    console.log(`${l2WalletAddress} balance on l2: ${l2WalletBalance} ether`);

    const mantaL2GatewayAddr = readDeployContract(
      logName.DEPLOY_L2_GATEWAY_LOG_PREFIX,
      logName.DEPLOY_GATEWAY,
      mantaName,
    );
    if (mantaL2GatewayAddr === undefined) {
      console.log('manta l2 gateway address not exist');
      return;
    }
    console.log(`The manta l2 gateway address: ${mantaL2GatewayAddr}`);

    const zkLinkAddr = readDeployContract(logName.DEPLOY_ZKLINK_LOG_PREFIX, logName.DEPLOY_LOG_ZKLINK_PROXY, mantaName);
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
    // txHash = "0x1a81ed28c1b74120753b0edf3d98e80b814ec5f065ad44b26c0cd6131dc04d22"
    let status = await messenger.getMessageStatus(txHash);
    console.log(`The message status update to: ${status}`);

    /**
     * Wait until the message is ready to prove
     * This step takes about 45 minutes.
     */
    await messenger.waitForMessageStatus(txHash, manta.MessageStatus.READY_TO_PROVE);
    /**
     * Once the message is ready to be proven, you'll send an L1 transaction to prove that the message was sent on L2.
     */
    console.log(`Proving the message...`);
    tx = await messenger.proveMessage(txHash);
    console.log(`The prove tx hash: ${tx.hash}`);
    await tx.wait();
    console.log(`The message has been proven`);
    status = await messenger.getMessageStatus(txHash);
    console.log(`The message status update to: ${status}`);
    /**
     * Wait until the message is ready for relay
     * The final step to sending messages from L2 to L1 is to relay the messages on L1. This can only happen after the fault proof period has elapsed. On OP Sepolia, this is only a few seconds. On OP Mainnet, this takes 7 days.
     * Manta is same way as Optimism
     */
    await messenger.waitForMessageStatus(txHash, manta.MessageStatus.READY_FOR_RELAY);
    console.log(`The message is ready for relay`);
    status = await messenger.getMessageStatus(txHash);
    console.log(`The message status update to: ${status}`);
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
    console.log(`The message status update to: ${status}`);
    /**
     * Wait until the message is relayed
     * Now you simply wait until the message is relayed.
     */
    // Waiting for the official manta bridge to forward the message to L2
    const rec = await messenger.waitForMessageReceipt(txHash);
    console.log(`The tx receipt: ${JSON.stringify(rec, null, 2)}`);
    console.log('Done!');

    // Example txs:
    // https://pacific-explorer.testnet.manta.network/tx/0x1a81ed28c1b74120753b0edf3d98e80b814ec5f065ad44b26c0cd6131dc04d22
    // https://goerli.etherscan.io/tx/0x54ce6421e1d9c1e7d2c35af292c9e3bbaf632b60115556a94b7fb61e53905599
  });
