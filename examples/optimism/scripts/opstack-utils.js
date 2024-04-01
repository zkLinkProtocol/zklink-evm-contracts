const ethers = require('ethers');
const { readDeployContract, getLogName } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { INIT_FEE_PARAMS } = require('../../../script/zksync_era');
const { zkLinkConfig } = require('../../../script/zklink_config');
const { DepositTx, applyL1ToL2Alias } = require('@eth-optimism/core-utils');

const MessageStatus = {
  UNCONFIRMED_L1_TO_L2_MESSAGE: 0,
  FAILED_L1_TO_L2_MESSAGE: 1,
  STATE_ROOT_NOT_PUBLISHED: 2,
  READY_TO_PROVE: 3,
  IN_CHALLENGE_PERIOD: 4,
  READY_FOR_RELAY: 5,
  RELAYED: 6,
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getContractAddresses(ethereumName, opChainName) {
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

  const zkLinkAddr = readDeployContract(logName.DEPLOY_ZKLINK_LOG_PREFIX, logName.DEPLOY_LOG_ZKLINK_PROXY, opChainName);
  if (zkLinkAddr === undefined) {
    console.log('zkLink address not exist');
    return;
  }
  console.log(`The zkLink address: ${zkLinkAddr}`);

  const l1GatewayLogName = getLogName(logName.DEPLOY_L1_GATEWAY_LOG_PREFIX, opChainName);
  const l1GatewayAddr = readDeployContract(l1GatewayLogName, logName.DEPLOY_GATEWAY, ethereumName);
  if (l1GatewayAddr === undefined) {
    console.log(`${opChainName} l1 gateway address not exist`);
    return;
  }
  console.log(`The ${opChainName} l1 gateway address: ${l1GatewayAddr}`);

  const l2GatewayAddr = readDeployContract(logName.DEPLOY_L2_GATEWAY_LOG_PREFIX, logName.DEPLOY_GATEWAY, opChainName);
  if (l2GatewayAddr === undefined) {
    console.log(`${opChainName} l2 gateway address not exist`);
    return;
  }
  console.log(`The ${opChainName} l2 gateway address: ${l2GatewayAddr}`);

  return {
    arbitratorAddr,
    zkLinkAddr,
    l1GatewayAddr,
    l2GatewayAddr,
  };
}

async function generateAdapterParams() {
  // NOTE: op stack series gateway,
  // the _minGasaLimit parameter required for SendMessage is defaulted to 0, on L2 GasLimit is fixed to 288648.
  // This value needs to be adjusted when an OutOfGas error occurs.
  const minGasLimit = 0;
  const adapterParams = ethers.utils.defaultAbiCoder.encode(['uint256'], [minGasLimit]);
  console.log(`The adapter params: ${adapterParams}`);

  return adapterParams;
}

async function syncBatchRoot(hre, messenger, ethereumName, opChainName) {
  const { arbitratorAddr, zkLinkAddr, l1GatewayAddr } = await getContractAddresses(ethereumName, opChainName);
  const l1Wallet = messenger.l1Signer;
  const l2Provider = messenger.l2Provider;

  const l1WalletAddress = await l1Wallet.getAddress();
  const l1WalletBalance = ethers.utils.formatEther((await l1Wallet.getBalance()).toString());
  console.log(`${l1WalletAddress} balance on l1: ${l1WalletBalance} ether`);

  // pre-execution calldata
  const zkLink = await hre.ethers.getContractAt('DummyZkLink', zkLinkAddr);
  const zklinkIface = zkLink.interface;
  const blockNumber = await l2Provider.getBlockNumber();
  console.log(`The current block number on l1: ${blockNumber}`);
  const l2LogsRootHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`L2 logs root hash ${blockNumber}`));
  console.log(`The l2 logs root hash: ${l2LogsRootHash}`);
  const executeCalldata = zklinkIface.encodeFunctionData('syncBatchRoot', [blockNumber, l2LogsRootHash, 0]);
  console.log(`The call data: ${executeCalldata}`);
  const adapterParams = await generateAdapterParams();
  // forward message to L2
  const arbitrator = await hre.ethers.getContractAt('DummyArbitrator', arbitratorAddr, l1Wallet);
  const sendData = arbitrator.interface.encodeFunctionData('forwardMessage', [
    l1GatewayAddr,
    0,
    executeCalldata,
    adapterParams,
  ]);
  const feeData = await l1Wallet.getFeeData();
  const gasLimit = await l1Wallet.provider.estimateGas({
    from: l1Wallet.address,
    to: arbitratorAddr,
    data: sendData,
  });
  console.log('Prepare to forward the message to L2...');
  let tx = await arbitrator.forwardMessage(l1GatewayAddr, 0, executeCalldata, adapterParams, {
    maxFeePerGas: feeData.maxFeePerGas.mul(2),
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas.mul(2),
    gasLimit: gasLimit.mul(2),
  });
  const txHash = tx.hash;
  console.log(`The tx hash: ${txHash}`);
  await tx.wait();
  console.log(`The transaction has been executed on L1`);
  // const txHash = "0x61e78c71aca383f9e15ccebae7ecca355131227319a80a338ac9f809d752a344";

  /**
   * Query the message informations on L1 via txHash.
   */
  const message = (await messenger.getMessagesByTransaction(txHash)).pop();
  console.log(`The message: ${JSON.stringify(message)}`);

  return message;
}

async function setValidator(hre, messenger, ethereumName, opChainName, validatorAddr, isActive) {
  const { arbitratorAddr, l1GatewayAddr } = await getContractAddresses(ethereumName, opChainName);
  const l1Wallet = messenger.l1Signer;
  const l1WalletAddress = await l1Wallet.getAddress();
  const l1WalletBalance = ethers.utils.formatEther((await l1Wallet.getBalance()).toString());
  console.log(`${l1WalletAddress} balance on l1: ${l1WalletBalance} ether`);

  const adapterParams = await generateAdapterParams();

  // forward message to L2
  const arbitrator = await hre.ethers.getContractAt('Arbitrator', arbitratorAddr, l1Wallet);
  const sendData = arbitrator.interface.encodeFunctionData('setValidator', [
    l1GatewayAddr,
    validatorAddr,
    isActive,
    adapterParams,
  ]);
  const feeData = await l1Wallet.getFeeData();
  const gasLimit = await l1Wallet.provider.estimateGas({
    from: l1Wallet.address,
    to: arbitratorAddr,
    data: sendData,
  });
  console.log('Prepare to forward the message to L2...');
  let tx = await arbitrator.setValidator(l1GatewayAddr, validatorAddr, isActive, adapterParams, {
    maxFeePerGas: feeData.maxFeePerGas.mul(2),
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas.mul(2),
    gasLimit: gasLimit.mul(2),
  });
  const txHash = tx.hash;
  console.log(`The tx hash: ${txHash}`);
  await tx.wait();
  console.log(`The transaction has been executed on L1`);

  /**
   * Query the message informations on L1 via txHash.
   */
  const message = (await messenger.getMessagesByTransaction(txHash)).pop();
  console.log(`The message: ${JSON.stringify(message)}`);

  return message;
}

async function changeFeeParams(hre, messenger, ethereumName, opChainName) {
  const { arbitratorAddr, l1GatewayAddr } = await getContractAddresses(ethereumName, opChainName);
  const l1Wallet = messenger.l1Signer;
  const l1WalletAddress = await l1Wallet.getAddress();
  const l1WalletBalance = ethers.utils.formatEther((await l1Wallet.getBalance()).toString());
  console.log(`${l1WalletAddress} balance on l1: ${l1WalletBalance} ether`);

  const adapterParams = await generateAdapterParams();

  // forward message to L2
  const arbitrator = await hre.ethers.getContractAt('Arbitrator', arbitratorAddr, l1Wallet);
  const sendData = arbitrator.interface.encodeFunctionData('changeFeeParams', [
    l1GatewayAddr,
    INIT_FEE_PARAMS,
    adapterParams,
  ]);
  const feeData = await l1Wallet.getFeeData();
  const gasLimit = await l1Wallet.provider.estimateGas({
    from: l1Wallet.address,
    to: arbitratorAddr,
    data: sendData,
  });
  console.log('Prepare to forward the message to L2...');
  let tx = await arbitrator.changeFeeParams(l1GatewayAddr, INIT_FEE_PARAMS, adapterParams, {
    maxFeePerGas: feeData.maxFeePerGas.mul(2),
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas.mul(2),
    gasLimit: gasLimit.mul(2),
  });
  const txHash = tx.hash;
  console.log(`The tx hash: ${txHash}`);
  await tx.wait();
  console.log(`The transaction has been executed on L1`);

  /**
   * Query the message informations on L1 via txHash.
   */
  const message = (await messenger.getMessagesByTransaction(txHash)).pop();
  console.log(`The message: ${JSON.stringify(message)}`);

  return message;
}

async function syncL2Requests(hre, messenger, ethereumName, opChainName, txs) {
  const { zkLinkAddr } = await getContractAddresses(ethereumName, opChainName);
  const l2Wallet = messenger.l2Signer;
  const l1Wallet = messenger.l1Signer;

  const l2WalletAddress = await l2Wallet.getAddress();
  const l2WalletBalance = ethers.utils.formatEther((await l2Wallet.getBalance()).toString());
  console.log(`${l2WalletAddress} balance on l2: ${l2WalletBalance} ether`);

  const zkLink = await hre.ethers.getContractAt('ZkLink', zkLinkAddr, l2Wallet);
  const calldata = zkLink.interface.encodeFunctionData('syncL2Requests', [txs]);
  const gasLimit = await l2Wallet.provider.estimateGas({
    from: l2Wallet.address,
    to: zkLinkAddr,
    data: calldata,
  });
  console.log(`The gas limit: ${gasLimit}`);
  console.log(`Send a l2 message to l1...`);
  let tx = await zkLink.syncL2Requests(txs, {
    gasLimit: gasLimit,
  });
  let txHash = tx.hash;
  console.log(`The tx hash: ${txHash}`);
  await tx.wait();
  console.log(`The transaction has been executed on L2`);

  // const txHash = "0xcebb6da21e5992821a897bdcbf8fbf00dda22d46881a0ebe29d390cdc3150631";
  const status = await messenger.getMessageStatus(txHash);
  console.log(`The message status update to: ${status}`);
  const feeData = await l1Wallet.getFeeData();
  console.log(`The fee data: ${JSON.stringify(feeData)}`);
  /**
   * Wait until the message is ready to prove
   * This step can take a few minutes.
   */
  await messenger.waitForMessageStatus(txHash, MessageStatus.READY_TO_PROVE);
  /**
   * Once the message is ready to be proven, you'll send an L1 transaction to prove that the message was sent on L2.
   */
  console.log(`Proving the message...`);
  tx = await messenger.proveMessage(txHash, {
    maxFeePerGas: feeData.maxFeePerGas.mul(2),
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas.mul(2),
  });
  console.log(`The prove tx hash: ${tx.hash}`);
  await tx.wait();
  console.log(`The message has been proven`);
  await sleep(5 * 60 * 1000); // wait for 5 minutes
  /**
   * Wait until the message is ready for relay
   * The final step to sending messages from L2 to L1 is to relay the messages on L1. This can only happen after the fault proof period has elapsed. On OP Sepolia, this is only a few seconds. On OP Mainnet, this takes 7 days.
   */
  await messenger.waitForMessageStatus(txHash, MessageStatus.READY_FOR_RELAY);
  /**
   * Relay the message on L1
   * Once the withdrawal is ready to be relayed you can finally complete the message sending process.
   */
  console.log(`Relaying the message...`);
  tx = await messenger.finalizeMessage(txHash, {
    maxFeePerGas: feeData.maxFeePerGas.mul(2),
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas.mul(2),
  });
  console.log(`The relay tx hash: ${tx.hash}`);
  await tx.wait();
  console.log(`The message has been relayed`);
}

async function encodeSetValidator(hre, ethereumName, opChainName, validatorAddr, isActive) {
  const { l1GatewayAddr } = await getContractAddresses(ethereumName, opChainName);
  const adapterParams = await generateAdapterParams();

  const arbitratorFactory = await hre.ethers.getContractFactory('Arbitrator');
  const calldata = arbitratorFactory.interface.encodeFunctionData('setValidator', [
    l1GatewayAddr,
    validatorAddr,
    isActive,
    adapterParams,
  ]);
  console.log(`The setValidator calldata: ${calldata}`);

  return calldata;
}

async function encodeChangeFeeParams(hre, ethereumName, opChainName) {
  const { l1GatewayAddr } = await getContractAddresses(ethereumName, opChainName);
  const adapterParams = await generateAdapterParams();

  const arbitratorFactory = await hre.ethers.getContractFactory('Arbitrator');
  const calldata = arbitratorFactory.interface.encodeFunctionData('changeFeeParams', [
    l1GatewayAddr,
    INIT_FEE_PARAMS,
    adapterParams,
  ]);
  console.log(`The changeFeeParams calldata: ${calldata}`);

  return calldata;
}

async function encodeL1ToL2Calldata(
  hre,
  messenger,
  ethereumName,
  opChainName,
  l2ToContractAddress,
  l2CallData,
  l2CallValue,
) {
  const l2ChainInfo = zkLinkConfig[opChainName];
  if (l2ChainInfo === undefined) {
    console.log('The l2 chain info not exist');
    return;
  }
  const portalContract = messenger.contracts.l1.OptimismPortal;
  console.log(`The optimism portal address: ${portalContract.address}`);

  const l1GovernanceAddr = readDeployContract(
    logName.DEPLOY_GOVERNANCE_LOG_PREFIX,
    logName.DEPLOY_LOG_GOVERNANCE,
    ethereumName,
  );
  if (l1GovernanceAddr === undefined) {
    console.log('governance address not exist');
    return;
  }
  console.log(`The l1 governance address: ${l1GovernanceAddr}`);
  const l2GovernanceAddr = applyL1ToL2Alias(l1GovernanceAddr);
  console.log(`The l2 governance address: ${l2GovernanceAddr}`);

  const l2Provider = messenger.l2Provider;
  let l2GasLimit = await l2Provider.estimateGas({
    from: l2GovernanceAddr,
    to: l2ToContractAddress,
    data: l2CallData,
    value: l2CallValue,
  });
  l2GasLimit = l2GasLimit.mul(120).div(100); // Add 20% buffer
  console.log(`The l2 gas limit: ${l2GasLimit.toString()}`);

  const sendMessageCalldata = portalContract.interface.encodeFunctionData('depositTransaction', [
    l2ToContractAddress,
    l2CallValue,
    l2GasLimit,
    false,
    l2CallData,
  ]);
  console.log(`The l1 to l2 call target: ${portalContract.address}`);
  console.log(`The l1 to l2 call data: ${sendMessageCalldata}`);
  console.log(`The l1 to l2 call value: ${l2CallValue}`);
}

async function checkL1TxStatus(hre, messenger, ethereumName, opChainName, l1TxHash) {
  const l1Provider = messenger.l1Provider;
  const l2Provider = messenger.l2Provider;
  const l1TxReceipt = await l1Provider.getTransactionReceipt(l1TxHash);
  const eventFilter =
    'TransactionDeposited(address indexed from, address indexed to, uint256 indexed version, bytes opaqueData)';
  const event = (
    await messenger.contracts.l1.OptimismPortal.queryFilter(
      eventFilter,
      l1TxReceipt.blockNumber,
      l1TxReceipt.blockNumber,
    )
  ).pop();
  const deposit = DepositTx.fromL1Event(event);
  await l2Provider.waitForTransaction(deposit.hash());
  console.log(`L1 to l2 tx is executed 🥳`);
}

module.exports = {
  getContractAddresses,
  syncBatchRoot,
  setValidator,
  changeFeeParams,
  syncL2Requests,
  encodeSetValidator,
  encodeChangeFeeParams,
  encodeL1ToL2Calldata,
  checkL1TxStatus,
};
