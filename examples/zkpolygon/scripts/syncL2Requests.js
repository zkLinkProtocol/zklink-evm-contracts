const { ZkEvmClient, use } = require('@maticnetwork/maticjs');
const { Web3ClientPlugin } = require('@maticnetwork/maticjs-ethers');
const { providers, Wallet, utils } = require('ethers');
const { readDeployContract, getLogName } = require('../../../script/utils');
const { CROSS_CHAIN_MESSENGER_ABI, L1_CROSS_CHAIN_MESSENGER_ADDREESS } = require('./constants');
const logName = require('../../../script/deploy_log_name');
const { task, types } = require('hardhat/config');

require('dotenv').config();
use(Web3ClientPlugin);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

task('syncL2Requests', 'Send sync point from zkLink to arbitrator')
  .addParam('txs', 'New sync point', 100, types.int, true)
  .setAction(async (taskArgs, hre) => {
    const txs = taskArgs.txs;
    console.log(`The sync point: ${txs}`);

    const walletPrivateKey = process.env.DEVNET_PRIVKEY;
    const l1Provider = new providers.JsonRpcProvider(process.env.L1RPC);
    const l2Provider = new providers.JsonRpcProvider(process.env.L2RPC);
    const zkpolygonName = process.env.ZKPOLYGON;
    const ethereumName = process.env.ETHEREUM;
    const l1Wallet = new Wallet(walletPrivateKey, l1Provider);
    const l2Wallet = new Wallet(walletPrivateKey, l2Provider);

    const messengerContract = await hre.ethers.getContractAt(
      CROSS_CHAIN_MESSENGER_ABI,
      L1_CROSS_CHAIN_MESSENGER_ADDREESS,
      l1Wallet,
    );
    console.log(`The messenger contract address: ${messengerContract.address}`);

    const l2WalletAddress = await l2Wallet.getAddress();
    console.log(`The l2 wallet address: ${l2WalletAddress}`);
    const l2WalletBalance = utils.formatEther(await l2Wallet.getBalance());
    console.log(`${l2WalletAddress} balance on l2: ${l2WalletBalance} ether`);

    const zkEvmClient = new ZkEvmClient();
    await zkEvmClient.init({
      network: ethereumName === 'GOERLI' ? 'testnet' : 'mainnet',
      version: 'blueberry',
      parent: {
        provider: l1Wallet,
      },
      child: {
        provider: l2Wallet,
      },
    });

    const arbitratorAddr = readDeployContract(
      logName.DEPLOY_ARBITRATOR_LOG_PREFIX,
      logName.DEPLOY_LOG_ARBITRATOR,
      ethereumName,
    );
    if (arbitratorAddr === undefined) {
      console.log('The arbitrator address not exist');
      return;
    }
    console.log(`The arbitrator address: ${arbitratorAddr}`);

    const zkLinkAddr = readDeployContract(
      logName.DEPLOY_ZKLINK_LOG_PREFIX,
      logName.DEPLOY_LOG_ZKLINK_PROXY,
      zkpolygonName,
    );
    if (zkLinkAddr === undefined) {
      console.log('zkLink address not exist');
      return;
    }
    console.log(`The zkLink address: ${zkLinkAddr}`);

    const l1GatewayLogName = getLogName(logName.DEPLOY_L1_GATEWAY_LOG_PREFIX, zkpolygonName);
    const zkpolygonL1GatewayAddr = readDeployContract(l1GatewayLogName, logName.DEPLOY_GATEWAY, ethereumName);
    if (zkpolygonL1GatewayAddr === undefined) {
      console.log('zkpolygon l1 gateway address not exist');
      return;
    }
    console.log(`The zkpolygon l1 gateway address: ${zkpolygonL1GatewayAddr}`);

    // pre-execution calldata
    const zkLink = await hre.ethers.getContractAt('ZkLink', zkLinkAddr, l2Wallet);
    console.log(`Send a l2 message to l1...`);
    let tx = await zkLink.syncL2Requests(txs);
    const txHash = tx.hash;
    console.log(`The L2ToL1 tx hash: ${txHash}`);
    await tx.wait();
    console.log(`The L2ToL1 tx has been confirmed`);
    // const txHash = '0x86ae19157d9ff409bf4e12fe5ade9ff4119f0c6dc04d145fb64e258e360a842c';

    /**
     * Wait for the withdraw to be confirmed
     */
    let isClaimable = false;
    /*eslint no-constant-condition: ["error", { "checkLoops": false }]*/
    while (!isClaimable) {
      isClaimable = await zkEvmClient.isWithdrawExitable(txHash);
      console.log(`The withdraw is claimable: ${isClaimable}`);

      await sleep(60 * 1000 * 10); // 10 minutes
    }

    /**
     * Claim message
     */
    const logData = await zkEvmClient.bridgeUtil.getBridgeLogData(txHash, false);
    console.log(`The logData: ${JSON.stringify(logData, null, 2)}`);
    const payload = await zkEvmClient.bridgeUtil.buildPayloadForClaim(txHash, false, logData.originNetwork);
    console.log(`The payload: ${JSON.stringify(payload, null, 2)}`);

    const claimTx = await messengerContract.claimMessage(
      payload.smtProof,
      logData.depositCount,
      payload.mainnetExitRoot,
      payload.rollupExitRoot,
      payload.originNetwork,
      payload.originTokenAddress,
      payload.destinationNetwork,
      payload.destinationAddress,
      payload.amount,
      payload.metadata,
    );
    console.log(`The claim tx: ${claimTx.hash}`);
    await claimTx.wait();
    console.log(`The claim tx has been confirmed`);

    // Example txs:
    // https://testnet-zkevm.polygonscan.com/tx/0x86ae19157d9ff409bf4e12fe5ade9ff4119f0c6dc04d145fb64e258e360a842c
    //
  });
