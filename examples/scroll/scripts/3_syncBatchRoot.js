const { providers, Wallet, utils } = require('ethers');
const { readDeployContract } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { task, types } = require('hardhat/config');

require('dotenv').config();

task('syncBatchRoot', 'Forward message to L2')
  .addParam('targetNetwork', 'L2 network name', undefined, types.string, true)
  .setAction(async (taskArgs, hre) => {
    const targetNetwork = taskArgs.targetNetwork;
    console.log(`The target network: ${targetNetwork}`);

    const walletPrivateKey = process.env.DEVNET_PRIVKEY;
    const l1Provider = new providers.JsonRpcProvider(process.env.L1RPC);
    const l2Provider = new providers.JsonRpcProvider(process.env.L2RPC);
    const ethereumName = process.env.ETHEREUM;
    const l1Wallet = new Wallet(walletPrivateKey, l1Provider);
    const l2Wallet = new Wallet(walletPrivateKey, l2Provider);

    const l2WalletAddress = await l2Wallet.getAddress();
    const l2WalletBalance = utils.formatEther(await l2Wallet.getBalance());
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
      targetNetwork,
    );
    if (zkLinkAddr === undefined) {
      console.log('zkLink address not exist');
      return;
    }
    console.log(`The zkLink address: ${zkLinkAddr}`);

    const scrollL1GatewayAddr = readDeployContract(
      logName.DEPLOY_L1_GATEWAY_LOG_PREFIX,
      logName.DEPLOY_GATEWAY,
      targetNetwork + '_' + ethereumName,
    );
    if (scrollL1GatewayAddr === undefined) {
      console.log('scroll l1 gateway address not exist');
      return;
    }
    console.log(`The scroll l1 gateway address: ${scrollL1GatewayAddr}`);

    // pre-execution calldata
    const zkLink = await hre.ethers.getContractAt('DummyZkLink', zkLinkAddr, l2Wallet);
    const zklinkIface = zkLink.interface;
    const blockNumber = await l2Provider.getBlockNumber();
    console.log(`The current block number: ${blockNumber}`);
    const l2LogsRootHash = hre.ethers.utils.keccak256(hre.ethers.utils.toUtf8Bytes(`L2 logs root hash ${blockNumber}`));
    console.log(`The l2 logs root hash: ${l2LogsRootHash}`);
    const callData = zklinkIface.encodeFunctionData('syncBatchRoot', [blockNumber, l2LogsRootHash]);
    console.log(`The call data: ${callData}`);

    // forward message to L2
    const arbitrator = await hre.ethers.getContractAt('DummyArbitrator', arbitratorAddr, l1Wallet);
    /**
     * The adapterParams is the parameters for the adapter, which is used to parse the calldata.
     * finalizeMessageGasLimit: the gas limit for the L2 to finalize the message.
     */
    const finalizeMessageGasLimit = 1000000;
    const adapterParams = hre.ethers.utils.defaultAbiCoder.encode(['uint256'], [finalizeMessageGasLimit]);
    let tx = await arbitrator.forwardMessage(scrollL1GatewayAddr, 0, callData, adapterParams, {
      gasLimit: 1000000,
      value: hre.ethers.utils.parseEther('0.001'),
    });
    await tx.wait();
    console.log(`The tx hash: ${tx.hash}`);

    // Waiting for the official Scroll bridge to forward the message to L2
    // No user action is required for follow-up.

    // Example txs:
    // https://sepolia.etherscan.io/tx/0xdd02bbc1a304791ab5fc53dd76f353b6391858d78553ad75797f3aff30aa04c4
    // https://sepolia.scrollscan.com/tx/0xfea71e57b844ec3c9a0289786ac55afec64aa71d1fdf35a8b3b2636c630d92fb
  });