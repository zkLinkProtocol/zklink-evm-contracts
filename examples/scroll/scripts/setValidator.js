const { JsonRpcProvider, Wallet, AbiCoder, formatEther } = require('ethers');
const { readDeployContract, getLogName } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { task, types } = require('hardhat/config');
const { ScrollSDK } = require('./scrollSDK');

require('dotenv').config();

task('setValidator', 'Set validator for zkLink')
  .addParam('validator', 'Validator Address', undefined, types.string)
  .addOptionalParam('active', 'Whether to activate the validator address', true, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const validatorAddr = taskArgs.validator;
    const isActive = taskArgs.active;
    console.log(`The validator: address: ${validatorAddr}, active: ${isActive}`);

    const walletPrivateKey = process.env.DEVNET_PRIVKEY;
    const l1Provider = new JsonRpcProvider(process.env.L1RPC);
    const l2Provider = new JsonRpcProvider(process.env.L2RPC);
    const ethereumName = process.env.ETHEREUM;
    const scrollName = process.env.SCROLL;
    const scrollSDK = new ScrollSDK(ethereumName, l1Provider, l2Provider);
    const l1Wallet = new Wallet(walletPrivateKey, l1Provider);

    const l1WalletAddress = await l1Wallet.getAddress();
    const l1WalletBalance = formatEther(await l1Provider.getBalance(l1WalletAddress));
    console.log(`${l1WalletAddress} balance on l1: ${l1WalletBalance} ether`);

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

    // forward message to L2
    const arbitrator = await hre.ethers.getContractAt('Arbitrator', arbitratorAddr, l1Wallet);
    /**
     * The adapterParams is the parameters for the adapter, which is used to parse the calldata.
     * finalizeMessageGasLimit: the gas limit for the L2 to finalize the message.
     */
    const zkLink = await hre.ethers.getContractFactory('ZkLink');
    const zkLinkCallValue = BigInt(0);
    const zkLinkCallData = zkLink.interface.encodeFunctionData('setValidator', [validatorAddr, isActive]);
    const l2GatewayFactory = await hre.ethers.getContractFactory('ScrollL2Gateway');
    const l2GatewayCallData = l2GatewayFactory.interface.encodeFunctionData('claimMessageCallback', [
      zkLinkCallValue,
      zkLinkCallData,
    ]);
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
    let tx = await arbitrator.setValidator(l1GatewayAddr, validatorAddr, isActive, adapterParams, {
      value: gasValue + zkLinkCallValue,
    });
    console.log(`The tx hash: ${tx.hash} , waiting confirm...`);
    await tx.wait();
    console.log(`The tx confirmed`);

    // Waiting for the official Scroll bridge to forward the message to L2
    // No user action is required for follow-up.
  });
