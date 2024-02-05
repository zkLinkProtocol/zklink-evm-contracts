const { Provider, Wallet } = require('zksync-ethers');
const { ethers } = require('ethers');
const { readDeployContract, getLogName } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { task, types } = require('hardhat/config');

require('dotenv').config();

task('syncL2Requests', 'Send sync point from zkLink to arbitrator')
  .addParam('value', 'Send msg value in ether', 0, types.string, true)
  .addParam('txs', 'New sync point', 100, types.int, true)
  .setAction(async (taskArgs, hre) => {
    const msgValue = taskArgs.value;
    const txs = taskArgs.txs;
    console.log(`The sync point: value: ${msgValue} ether, txs: ${txs}`);

    const walletPrivateKey = process.env.DEVNET_PRIVKEY;
    const l1Provider = new Provider(process.env.L1RPC);
    console.log(`Block number: ${await l1Provider.getBlockNumber()}`);

    const l2Provider = new Provider(process.env.L2RPC);
    console.log(`Block number: ${await l2Provider.getBlockNumber()}`);

    const zksyncName = process.env.ZKSYNC;
    const ethereumName = process.env.ETHEREUM;
    const l1Wallet = new ethers.Wallet(walletPrivateKey, l1Provider);
    const l2Wallet = new Wallet(walletPrivateKey, l2Provider);

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
    const l2Tx = await zkLink.syncL2Requests(txs, { value: ethers.parseEther(msgValue) });
    const txHash = l2Tx.hash;
    console.log(`The l2 tx hash: ${txHash}`);
    // const txHash = "0xea2da9a0bf26de481403976a49dab1cb13362a609370d8b175f52cd9c0e46bc3"
    const txHandle = await l2Provider.getTransaction(txHash);
    await txHandle.wait();

    // waiting to finalize can take a few minutes.
    await txHandle.waitFinalize();

    const proof = await l2Provider.getLogProof(txHash);
    console.log('Proof :>> ', proof);
    const { l1BatchNumber, l1BatchTxIndex } = await l2Provider.getTransactionReceipt(txHash);
    console.log('L1 Index for Tx in block :>> ', l1BatchTxIndex);
    console.log('L1 Batch for block :>> ', l1BatchNumber);

    /**
     * Now that its confirmed and not executed, we can execute our message in its outbox entry.
     */
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const callData = abiCoder.encode(['uint256', 'uint256'], [ethers.parseEther(msgValue), txs]);
    const message = abiCoder.encode(['uint256', 'bytes'], [ethers.parseEther(msgValue), callData]);
    console.log(`The message sent from L2 to L1: ${message}`);
    const l1Gateway = await hre.ethers.getContractAt('ZkSyncL1Gateway', l1GatewayAddr, l1Wallet);
    const l1Tx = await l1Gateway.finalizeMessage(l1BatchNumber, proof.id, l1BatchTxIndex, message, proof.proof);
    const l1Receipt = await l1Tx.wait();
    console.log('Done! Your transaction is executed', l1Receipt);

    /** Example Txs
     * https://sepolia.explorer.zksync.io/tx/0xea2da9a0bf26de481403976a49dab1cb13362a609370d8b175f52cd9c0e46bc3
     * https://sepolia.etherscan.io/tx/0xa1cee7b21085d3ee3e359aea3704f5ba15676db38d83a64be48e25cad716cab4
     */
  });
