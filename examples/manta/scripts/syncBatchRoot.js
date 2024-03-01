const manta = require('@eth-optimism/sdk');
const ethers = require('ethers');
const { readDeployContract, getLogName } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { task } = require('hardhat/config');
require('dotenv').config();

task('syncBatchRoot', 'Forward message to L2').setAction(async (taskArgs, hre) => {
  const walletPrivateKey = process.env.DEVNET_PRIVKEY;
  const l1Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L1RPC);
  const l2Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L2RPC);
  const ethereumName = process.env.ETHEREUM;
  const mantaName = process.env.MANTA;
  const l1Wallet = new ethers.Wallet(walletPrivateKey, l1Provider);
  const l2Wallet = new ethers.Wallet(walletPrivateKey, l2Provider);
  // https://github.com/Manta-Network/bridging-tutorial/blob/ad640a17264e2f009065811a0ff0872d8063b27b/standard-bridge-custom-token/README.md?plain=1#L152
  const messenger = new manta.CrossChainMessenger({
    l1ChainId: ethereumName !== 'ETHEREUM' ? 5 : 1, // 5 for Goerli, 1 for Ethereum
    l2ChainId: ethereumName !== 'ETHEREUM' ? 3441005 : 169, // 3441005 for Manta Pacific Testnet, 169 for Manta Pacific Mainnet
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

  // pre-execution calldata
  const zkLink = await hre.ethers.getContractAt('DummyZkLink', zkLinkAddr, l2Wallet);
  const zklinkIface = zkLink.interface;
  const blockNumber = await l2Provider.getBlockNumber();
  console.log(`The current block number: ${blockNumber}`);
  const l2LogsRootHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`L2 logs root hash ${blockNumber}`));
  console.log(`The l2 logs root hash: ${l2LogsRootHash}`);
  const executeCalldata = zklinkIface.encodeFunctionData('syncBatchRoot', [blockNumber, l2LogsRootHash, 0]);
  console.log(`The call data: ${executeCalldata}`);
  const gateway = await hre.ethers.getContractAt('OptimismGateway', mantaL2GatewayAddr, l2Wallet);
  const sendData = gateway.interface.encodeFunctionData('claimMessageCallback', [0, executeCalldata]);

  const gasLimit = await messenger.estimateGas.sendMessage({
    direction: 1, // L2_TO_L1, Estimating the Gas Required on L2
    target: mantaL2GatewayAddr,
    message: sendData,
  });
  console.log(`The gas limit: ${gasLimit}`);

  // forward message to L2
  const arbitrator = await hre.ethers.getContractAt('DummyArbitrator', arbitratorAddr, l1Wallet);
  const adapterParams = ethers.utils.defaultAbiCoder.encode(['uint256'], [gasLimit]);
  console.log('Prepare to forward the message to L2...');
  let tx = await arbitrator.forwardMessage(mantaL1GatewayAddr, 0, executeCalldata, adapterParams);
  const txHash = tx.hash;
  console.log(`The tx hash: ${txHash}`);
  await tx.wait();
  console.log(`The transaction has been executed on L1`);

  /**
   * Query the message informations on L1 via txHash.
   */
  const message = (await messenger.getMessagesByTransaction(txHash)).pop();
  // Waiting for the official manta bridge to forward the message to L2
  const rec = await messenger.waitForMessageReceipt(message);
  console.log(`The tx receipt: ${JSON.stringify(rec, null, 2)}`);
  console.log('Done');

  // Example txs:
  // https://goerli.etherscan.io/tx/0x12b283959163783e7faf186b70fd4513560a3a41f79099f56ae984c2ac81be6d
  // https://pacific-explorer.testnet.manta.network/tx/0xbce746d631ac613b61f224138779cbcf3a2f744864b50443440c1c9346cc4c11
});
