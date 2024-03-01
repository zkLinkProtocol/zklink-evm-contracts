const { ZkEvmClient, use } = require('@maticnetwork/maticjs');
const { Web3ClientPlugin } = require('@maticnetwork/maticjs-ethers');
const { providers, Wallet, utils } = require('ethers');
const { readDeployContract, getLogName } = require('../../../script/utils');
const { CROSS_CHAIN_MESSENGER_ABI, L2_CROSS_CHAIN_MESSENGER_ADDREESS } = require('./constants');
const logName = require('../../../script/deploy_log_name');
const { task, types } = require('hardhat/config');

require('dotenv').config();
use(Web3ClientPlugin);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

task('setValidator', 'Set validator for zkLink')
  .addParam('validator', 'Validator Address', undefined, types.string)
  .addOptionalParam('active', 'Whether to activate the validator address', true, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const validatorAddr = taskArgs.validator;
    const isActive = taskArgs.active;
    console.log(`The validator: address: ${validatorAddr}, active: ${isActive}`);

    const walletPrivateKey = process.env.DEVNET_PRIVKEY;
    const l1Provider = new providers.JsonRpcProvider(process.env.L1RPC);
    const l2Provider = new providers.JsonRpcProvider(process.env.L2RPC);
    const zkpolygonName = process.env.ZKPOLYGON;
    const ethereumName = process.env.ETHEREUM;
    const l1Wallet = new Wallet(walletPrivateKey, l1Provider);
    const l2Wallet = new Wallet(walletPrivateKey, l2Provider);

    const messengerContract = await hre.ethers.getContractAt(
      CROSS_CHAIN_MESSENGER_ABI,
      L2_CROSS_CHAIN_MESSENGER_ADDREESS,
      l2Wallet,
    );
    console.log(`The messenger contract address: ${messengerContract.address}`);

    const l1WalletAddress = await l1Wallet.getAddress();
    console.log(`The l1 wallet address: ${l1WalletAddress}`);
    const l1WalletBalance = utils.formatEther(await l1Wallet.getBalance());
    console.log(`${l1WalletAddress} balance on l1: ${l1WalletBalance} ether`);

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

    // forward message to L2
    const arbitrator = await hre.ethers.getContractAt('Arbitrator', arbitratorAddr, l1Wallet);
    const adapterParams = '0x';
    let tx = await arbitrator.setValidator(zkpolygonL1GatewayAddr, validatorAddr, isActive, adapterParams);
    const txHash = tx.hash;
    console.log(`The forward tx hash: ${txHash}`);
    await tx.wait();
    console.log(`The forward tx has been confirmed`);
    // const txHash = "0xdae14d7d571447f29c67a3a652aede56c0ff68211f84fcb074b416c117e15e9f";

    /**
     * Wait for the deposit to be confirmed
     */
    let isClaimable = false;
    /*eslint no-constant-condition: ["error", { "checkLoops": false }]*/
    while (!isClaimable) {
      isClaimable = await zkEvmClient.isDepositClaimable(txHash);
      console.log(`The deposit is claimable: ${isClaimable}`);

      await sleep(60 * 1000 * 10); // 10 minutes
    }

    /**
     * Claim message
     */
    const logData = await zkEvmClient.bridgeUtil.getBridgeLogData(txHash, true);
    console.log(`The logData: ${JSON.stringify(logData, null, 2)}`);
    const payload = await zkEvmClient.bridgeUtil.buildPayloadForClaim(txHash, true, logData.originNetwork);
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
  });
