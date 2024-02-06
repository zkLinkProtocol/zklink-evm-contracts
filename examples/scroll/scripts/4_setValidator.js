const { providers, Wallet, utils } = require('ethers');
const { readDeployContract, getLogName } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { task, types } = require('hardhat/config');

require('dotenv').config();

task('setValidator', 'Set validator for zkLink')
  .addParam('validator', 'Validator Address', undefined, types.string, true)
  .addParam('active', 'Whether to activate the validator address', true, types.boolean, true)
  .setAction(async (taskArgs, hre) => {
    const validatorAddr = taskArgs.validator;
    const isActive = taskArgs.active;
    console.log(`The validator: address: ${validatorAddr}, active: ${isActive}`);

    const walletPrivateKey = process.env.DEVNET_PRIVKEY;
    const l1Provider = new providers.JsonRpcProvider(process.env.L1RPC);
    const ethereumName = process.env.ETHEREUM;
    const scrollName = process.env.SCROLL;
    const l1Wallet = new Wallet(walletPrivateKey, l1Provider);

    const l1WalletAddress = await l1Wallet.getAddress();
    const l1WalletBalance = utils.formatEther(await l1Wallet.getBalance());
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
    const scrollL1GatewayAddr = readDeployContract(l1GatewayLogName, logName.DEPLOY_GATEWAY, ethereumName);
    if (scrollL1GatewayAddr === undefined) {
      console.log('scroll l1 gateway address not exist');
      return;
    }
    console.log(`The scroll l1 gateway address: ${scrollL1GatewayAddr}`);

    // forward message to L2
    const arbitrator = await hre.ethers.getContractAt('Arbitrator', arbitratorAddr, l1Wallet);
    /**
     * The adapterParams is the parameters for the adapter, which is used to parse the calldata.
     * finalizeMessageGasLimit: the gas limit for the L2 to finalize the message.
     */
    const finalizeMessageGasLimit = 1000000;
    const adapterParams = hre.ethers.utils.defaultAbiCoder.encode(['uint256'], [finalizeMessageGasLimit]);
    let tx = await arbitrator.setValidator(scrollL1GatewayAddr, validatorAddr, isActive, adapterParams, {
      value: hre.ethers.utils.parseEther('0.001'),
    });
    console.log(`The tx hash: ${tx.hash}`);
    await tx.wait();

    // Waiting for the official Scroll bridge to forward the message to L2
    // No user action is required for follow-up.
  });
