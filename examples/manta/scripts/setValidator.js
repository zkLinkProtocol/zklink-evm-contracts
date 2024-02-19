const manta = require('@eth-optimism/sdk');
const ethers = require('ethers');
const { readDeployContract, getLogName } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { task, types } = require('hardhat/config');
require('dotenv').config();

task('setValidator', 'Set validator for zkLink')
  .addParam('validator', 'Validator Address', undefined, types.string)
  .addOptionalParam('active', 'Whether to activate the validator address', true, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const validatorAddr = taskArgs.validator;
    const isActive = taskArgs.active;
    console.log(`The validator: address: ${validatorAddr}, active: ${isActive}`);

    const walletPrivateKey = process.env.DEVNET_PRIVKEY;
    const l1Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L1RPC);
    const l2Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L2RPC);
    const ethereumName = process.env.ETHEREUM;
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

    const l1WalletAddress = await l1Wallet.getAddress();
    const l1WalletBalance = ethers.utils.formatEther(await l1Wallet.getBalance());
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

    const zkLinkAddr = readDeployContract(logName.DEPLOY_ZKLINK_LOG_PREFIX, logName.DEPLOY_LOG_ZKLINK_PROXY, mantaName);
    if (zkLinkAddr === undefined) {
      console.log('zkLink address not exist');
      return;
    }
    console.log(`The zkLink address: ${zkLinkAddr}`);

    const l1GatewayLogName = getLogName(logName.DEPLOY_L1_GATEWAY_LOG_PREFIX, mantaName);
    const mantaL1GatewayAddr = readDeployContract(l1GatewayLogName, logName.DEPLOY_GATEWAY, ethereumName);
    if (mantaL1GatewayAddr === undefined) {
      console.log('manta l1 gateway address not exist');
      return;
    }
    console.log(`The manta l1 gateway address: ${mantaL1GatewayAddr}`);

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

    const zkLink = await hre.ethers.getContractAt('ZkLink', zkLinkAddr, l2Wallet);
    const executeCalldata = zkLink.interface.encodeFunctionData('setValidator', [validatorAddr, isActive]);
    const mantaL2Gateway = await hre.ethers.getContractAt('OptimismGateway', mantaL2GatewayAddr, l1Wallet);
    const sendData = mantaL2Gateway.interface.encodeFunctionData('claimMessageCallback', [0, executeCalldata]);

    const gasLimit = await messenger.estimateGas.sendMessage({
      direction: 1, // L2_TO_L1, Estimating the Gas Required on L2
      target: mantaL2GatewayAddr,
      message: sendData,
    });
    console.log(`The gas limit: ${gasLimit}`);

    // forward message to L2
    const arbitrator = await hre.ethers.getContractAt('Arbitrator', arbitratorAddr, l1Wallet);
    const adapterParams = ethers.utils.defaultAbiCoder.encode(['uint256'], [gasLimit]);
    console.log('Prepare to forward the message to L2...');
    let tx = await arbitrator.setValidator(mantaL1GatewayAddr, validatorAddr, isActive, adapterParams);
    const txHash = tx.hash;
    await tx.wait();
    console.log(`The tx hash: ${txHash}`);

    /**
     * Query the message informations on L1 via txHash.
     */
    const message = (await messenger.getMessagesByTransaction(txHash)).pop();
    console.log(`The message: ${JSON.stringify(message)}`);
    // Waiting for the official manta bridge to forward the message to L2
    const rec = await messenger.waitForMessageReceipt(message);
    console.log(`The tx receipt: ${JSON.stringify(rec)}`);
    console.log('Done');
  });
