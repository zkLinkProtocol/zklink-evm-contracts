const blast = require('@eth-optimism/sdk');
const ethers = require('ethers');
const { readDeployContract, getLogName } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { L1_MAINNET_CONTRACTS, L1_TESTNET_CONTRACTS } = require('./constants');
const { task } = require('hardhat/config');
require('dotenv').config();

task('syncBatchRoot', 'Forward message to L2').setAction(async (taskArgs, hre) => {
  const walletPrivateKey = process.env.DEVNET_PRIVKEY;
  const l1Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L1RPC);
  const l2Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L2RPC);
  const blastName = process.env.BLAST;
  const ethereumName = process.env.ETHEREUM;
  const l1Wallet = new ethers.Wallet(walletPrivateKey, l1Provider);
  const l2Wallet = new ethers.Wallet(walletPrivateKey, l2Provider);

  const messengerL1Contracts = ethereumName !== 'ETHEREUM' ? L1_TESTNET_CONTRACTS : L1_MAINNET_CONTRACTS;
  const messenger = new blast.CrossChainMessenger({
    l1ChainId: await l1Wallet.getChainId(), // 11155111 for Sepolia, 1 for Ethereum
    l2ChainId: await l2Wallet.getChainId(), // 168587773 for Blast Testnet, 81457 for Blast Mainnet
    l1SignerOrProvider: l1Wallet,
    l2SignerOrProvider: l2Wallet,
    bedrock: false,
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

  const zkLinkAddr = readDeployContract(logName.DEPLOY_ZKLINK_LOG_PREFIX, logName.DEPLOY_LOG_ZKLINK_PROXY, blastName);
  if (zkLinkAddr === undefined) {
    console.log('zkLink address not exist');
    return;
  }
  console.log(`The zkLink address: ${zkLinkAddr}`);

  const l1GatewayLogName = getLogName(logName.DEPLOY_L1_GATEWAY_LOG_PREFIX, blastName);
  const blastL1GatewayAddr = readDeployContract(l1GatewayLogName, logName.DEPLOY_GATEWAY, ethereumName);
  if (blastL1GatewayAddr === undefined) {
    console.log('blast l1 gateway address not exist');
    return;
  }
  console.log(`The blast l1 gateway address: ${blastL1GatewayAddr}`);

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

  // pre-execution calldata
  const zkLink = await hre.ethers.getContractAt('DummyZkLink', zkLinkAddr, l2Wallet);
  const zklinkIface = zkLink.interface;
  const blockNumber = await l2Provider.getBlockNumber();
  console.log(`The current block number: ${blockNumber}`);
  const l2LogsRootHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`L2 logs root hash ${blockNumber}`));
  console.log(`The l2 logs root hash: ${l2LogsRootHash}`);
  const executeCalldata = zklinkIface.encodeFunctionData('syncBatchRoot', [blockNumber, l2LogsRootHash, 0]);
  console.log(`The call data: ${executeCalldata}`);
  const gateway = await hre.ethers.getContractAt('OptimismGateway', blastL1GatewayAddr, l2Wallet);
  const sendData = gateway.interface.encodeFunctionData('claimMessageCallback', [0, executeCalldata]);

  const gasLimit = await messenger.estimateGas.sendMessage({
    direction: 0, // L1_TO_L2, Estimating the Gas Required on L2
    target: blastL1GatewayAddr,
    message: sendData,
  });
  console.log(`The gas limit: ${gasLimit}`);

  // forward message to L2
  const arbitrator = await hre.ethers.getContractAt('DummyArbitrator', arbitratorAddr, l1Wallet);
  const adapterParams = ethers.utils.defaultAbiCoder.encode(['uint256'], [gasLimit]);
  console.log(`The adapter params: ${adapterParams}`);
  console.log('Prepare to forward the message to L2...');
  let tx = await arbitrator.forwardMessage(blastL1GatewayAddr, 0, executeCalldata, adapterParams);
  const txHash = tx.hash;
  console.log(`The tx hash: ${txHash}`);
  await tx.wait();
  console.log(`The transaction has been executed on L1`);
  // const txHash = "0x742c8aedb51057196d55f2a908c4f7704ad5b4d5fcf1d10a333002dedb7beaf6"

  const status = await messenger.waitForMessageStatus(txHash, blast.MessageStatus.RELAYED);
  console.log(`The message status: ${status}`);
  /**
   * Query the message informations on L1 via txHash.
   */
  const message = (await messenger.getMessagesByTransaction(txHash)).pop();
  console.log(`The message: ${JSON.stringify(message, null, 2)}`);
  console.log('Done');
  // Waiting for the official blast bridge to forward the message to L2

  // Example txs:
  //
  //
});
