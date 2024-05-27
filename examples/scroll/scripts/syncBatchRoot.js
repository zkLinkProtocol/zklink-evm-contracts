const { JsonRpcProvider, Wallet, AbiCoder, formatEther, parseEther } = require('ethers');
const { readDeployContract, getLogName } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { task, types } = require('hardhat/config');
const { ScrollSDK } = require('./scrollSDK');

require('dotenv').config();

task('syncBatchRoot', 'Forward message to L2')
  .addOptionalParam('number', 'The batch number', 50, types.int)
  .addOptionalParam(
    'hash',
    'The batch root hash',
    '0x9edd5a1d6275b9d57b87490dfbf75fd0f8a9117c91923f2d0fac8c77cc40dace',
    types.string,
  )
  .addOptionalParam('value', 'The forward value', '0', types.string)
  .setAction(async (taskArgs, hre) => {
    const number = taskArgs.number;
    const hash = taskArgs.hash;
    const forwardAmount = parseEther(taskArgs.value);
    console.log(`The sync batch: number: ${number}, root hash: ${hash}, forward value: ${forwardAmount}`);

    const walletPrivateKey = process.env.DEVNET_PRIVKEY;
    const l1Provider = new JsonRpcProvider(process.env.L1RPC);
    const l2Provider = new JsonRpcProvider(process.env.L2RPC);
    const scrollName = process.env.SCROLL;
    const ethereumName = process.env.ETHEREUM;
    const l1Wallet = new Wallet(walletPrivateKey, l1Provider);
    const l2Wallet = new Wallet(walletPrivateKey, l2Provider);
    const scrollSDK = new ScrollSDK(ethereumName, l1Provider, l2Provider);

    const l1WalletAddress = await l1Wallet.getAddress();
    const l1WalletBalance = formatEther(await l1Provider.getBalance(l1WalletAddress));
    console.log(`${l1WalletAddress} balance on l1: ${l1WalletBalance} ether`);

    const l2WalletAddress = await l2Wallet.getAddress();
    const l2WalletBalance = formatEther(await l2Provider.getBalance(l2WalletAddress));
    console.log(`${l2WalletAddress} balance on l2: ${l2WalletBalance} ether`);

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
      scrollName,
    );
    if (zkLinkAddr === undefined) {
      console.log('zkLink address not exist');
      return;
    }
    console.log(`The zkLink address: ${zkLinkAddr}`);

    const l1GatewayLogName = getLogName(logName.DEPLOY_L1_GATEWAY_LOG_PREFIX, scrollName);
    const l1GatewayAddr = readDeployContract(l1GatewayLogName, logName.DEPLOY_GATEWAY, ethereumName);
    if (l1GatewayAddr === undefined) {
      console.log('The l1 gateway address not exist');
      return;
    }
    console.log(`The l1 gateway address: ${l1GatewayAddr}`);

    const l2GatewayAddr = readDeployContract(logName.DEPLOY_L2_GATEWAY_LOG_PREFIX, logName.DEPLOY_GATEWAY, scrollName);
    if (l2GatewayAddr === undefined) {
      console.log('l2 gateway address not exist');
      return;
    }
    console.log(`The l2 gateway address: ${l2GatewayAddr}`);

    const arbitrator = await hre.ethers.getContractAt('DummyArbitrator', arbitratorAddr, l1Wallet);
    const zkLinkFactory = await hre.ethers.getContractFactory('DummyZkLink');
    const zkLinkCallValue = forwardAmount;
    const zkLinkCallData = zkLinkFactory.interface.encodeFunctionData('syncBatchRoot', [number, hash, zkLinkCallValue]);
    const l2GatewayFactory = await hre.ethers.getContractFactory('ScrollL2Gateway');
    const l2GatewayCallData = l2GatewayFactory.interface.encodeFunctionData('claimMessageCallback', [
      zkLinkCallValue,
      zkLinkCallData,
    ]);

    /**
     * The adapterParams is the parameters for the adapter, which is used to parse the calldata.
     * finalizeMessageGasLimit: the gas limit for the L2 to finalize the message.
     */
    let finalizeMessageGasLimit = await scrollSDK.l2EstimateRelayMessageGasLimit(
      l1GatewayAddr,
      l2GatewayAddr,
      zkLinkCallValue,
      l2GatewayCallData,
    );
    finalizeMessageGasLimit = (finalizeMessageGasLimit * BigInt(120)) / BigInt(100);
    console.log(`The l1 to l2 gas limit: ${finalizeMessageGasLimit}`);
    const gasValue = await scrollSDK.l1ToL2GasValue(finalizeMessageGasLimit);
    console.log(`The fee: ${formatEther(gasValue)} ether`);
    const adapterParams = AbiCoder.defaultAbiCoder().encode(['uint256'], [finalizeMessageGasLimit]);

    // forward message to L2
    console.log(`Send a l1 message to l2...`);
    let tx = await arbitrator.forwardMessage(l1GatewayAddr, zkLinkCallValue, zkLinkCallData, adapterParams, {
      value: gasValue + zkLinkCallValue,
    });
    await tx.wait();
    console.log(`The tx hash: ${tx.hash}`);
  });
