const blast = require('@eth-optimism/sdk');
const ethers = require('ethers');
const { readDeployContract } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const {
  OPTIMISM_PORTAL_ABI,
  YIELD_MANAGER_ABI,
  YIELD_MANAGER_MAINNET_ADDRESS,
  YIELD_MANAGER_TESTNET_ADDRESS,
  L1_MAINNET_CONTRACTS,
  L1_TESTNET_CONTRACTS,
} = require('./constants');
const { task, types } = require('hardhat/config');

require('dotenv').config();

task('syncL2Requests', 'Send sync point to arbitrator')
  .addParam('txs', 'New sync point', 100, types.int, true)
  .setAction(async (taskArgs, hre) => {
    const txs = taskArgs.txs;
    console.log(`The sync point: txs: ${txs}`);

    const walletPrivateKey = process.env.DEVNET_PRIVKEY;
    const l1Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L1RPC);
    console.log(`The l1 block number: ${await l1Provider.getBlockNumber()}`);
    const l2Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L2RPC);
    const blastName = process.env.BLAST;
    const ethereumName = process.env.ETHEREUM;
    const l1Wallet = new ethers.Wallet(walletPrivateKey, l1Provider);
    const l2Wallet = new ethers.Wallet(walletPrivateKey, l2Provider);
    const messengerL1Contracts = ethereumName !== 'ETHEREUM' ? L1_TESTNET_CONTRACTS : L1_MAINNET_CONTRACTS;
    const yieldManagerAddress =
      ethereumName !== 'ETHEREUM' ? YIELD_MANAGER_TESTNET_ADDRESS : YIELD_MANAGER_MAINNET_ADDRESS;
    const messenger = new blast.CrossChainMessenger({
      l1ChainId: await l1Wallet.getChainId(), // 11155111 for Sepolia, 1 for Ethereum
      l2ChainId: await l2Wallet.getChainId(), // 168587773 for Blast Testnet, 81457 for Blast Mainnet
      l1SignerOrProvider: l1Wallet,
      l2SignerOrProvider: l2Wallet,
      bridges: {
        Standard: {
          Adapter: blast.StandardBridgeAdapter,
          l1Bridge: messengerL1Contracts.L1StandardBridge,
          l2Bridge: '0x4200000000000000000000000000000000000010',
        },
      },
      contracts: {
        l1: messengerL1Contracts,
      },
    });

    const optimismPortalContract = await hre.ethers.getContractAt(
      OPTIMISM_PORTAL_ABI,
      messengerL1Contracts.OptimismPortal,
      l1Wallet,
    );
    console.log(`The optimism portal contract address: ${optimismPortalContract.address}`);

    const yieldManagerContract = await hre.ethers.getContractAt(YIELD_MANAGER_ABI, yieldManagerAddress, l1Wallet);
    console.log(`The yield manager contract address: ${yieldManagerContract.address}`);

    const l2WalletAddress = await l2Wallet.getAddress();
    const l2WalletBalance = ethers.utils.formatEther(await l2Wallet.getBalance());
    console.log(`${l2WalletAddress} balance on l2: ${l2WalletBalance} ether`);

    const blastL2GatewayAddr = readDeployContract(
      logName.DEPLOY_L2_GATEWAY_LOG_PREFIX,
      logName.DEPLOY_GATEWAY,
      blastName,
    );
    if (blastL2GatewayAddr === undefined) {
      console.log('blast l2 gateway address not exist');
      return;
    }
    console.log(`The blast l2 gateway address: ${blastL2GatewayAddr}`);

    const zkLinkAddr = readDeployContract(logName.DEPLOY_ZKLINK_LOG_PREFIX, logName.DEPLOY_LOG_ZKLINK_PROXY, blastName);
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
    const message = (await messenger.getMessagesByTransaction(txHash)).pop();
    console.log(`The message: ${JSON.stringify(message, null, 2)}`);

    let status = await messenger.getMessageStatus(txHash);
    console.log(`The message status: ${status}`);
  });
