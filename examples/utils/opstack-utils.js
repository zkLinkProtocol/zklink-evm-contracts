const ethers = require('ethers');
const { readDeployContract, getLogName } = require('../../script/utils');
const logName = require('../../script/deploy_log_name');
const { INIT_FEE_PARAMS } = require('../../script/zksync_era');

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

async function getContractAddresses(ethereumName, opChainName, chainName) {
  if (chainName === undefined) {
    chainName = 'op stack chain';
  }

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
    console.log(`${chainName} l1 gateway address not exist`);
    return;
  }
  console.log(`The ${chainName} l1 gateway address: ${l1GatewayAddr}`);

  const l2GatewayAddr = readDeployContract(logName.DEPLOY_L2_GATEWAY_LOG_PREFIX, logName.DEPLOY_GATEWAY, opChainName);
  if (l2GatewayAddr === undefined) {
    console.log(`${chainName} l2 gateway address not exist`);
    return;
  }
  console.log(`The ${chainName} l2 gateway address: ${l2GatewayAddr}`);

  return {
    arbitratorAddr,
    zkLinkAddr,
    l1GatewayAddr,
    l2GatewayAddr,
  };
}

async function generateAdapterParams(hre, messenger, l2GatewayAddr, executeCalldata) {
  const l2Gateway = await hre.ethers.getContractAt('IMessageClaimer', l2GatewayAddr);
  const sendData = l2Gateway.interface.encodeFunctionData('claimMessageCallback', [0, executeCalldata]);

  const gasLimit = await messenger.estimateGas.sendMessage({
    direction: 1, // L2_TO_L1, Estimating the Gas Required on L2
    target: l2GatewayAddr,
    message: sendData,
  });
  console.log(`The gas limit: ${gasLimit.toString()}`);

  const adapterParams = ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [gasLimit.toString()]);
  console.log(`The adapter params: ${adapterParams}`);

  return adapterParams;
}

async function syncBatchRoot(hre, messenger, l1Wallet, l2Provider, ethereumName, opChainName, chainName) {
  const { arbitratorAddr, zkLinkAddr, l1GatewayAddr, l2GatewayAddr } = await getContractAddresses(
    ethereumName,
    opChainName,
    chainName,
  );

  // pre-execution calldata
  const zkLink = await hre.ethers.getContractAt('DummyZkLink', zkLinkAddr);
  const zklinkIface = zkLink.interface;
  const blockNumber = await l2Provider.getBlockNumber();
  console.log(`The current block number on l1: ${blockNumber}`);
  const l2LogsRootHash = ethers.keccak256(ethers.toUtf8Bytes(`L2 logs root hash ${blockNumber}`));
  console.log(`The l2 logs root hash: ${l2LogsRootHash}`);
  const executeCalldata = zklinkIface.encodeFunctionData('syncBatchRoot', [blockNumber, l2LogsRootHash, 0]);
  console.log(`The call data: ${executeCalldata}`);
  const adapterParams = await generateAdapterParams(hre, messenger, l2GatewayAddr, executeCalldata);

  // forward message to L2
  const arbitrator = await hre.ethers.getContractAt('DummyArbitrator', arbitratorAddr, l1Wallet);
  console.log('Prepare to forward the message to L2...');
  let tx = await arbitrator.forwardMessage(l1GatewayAddr, 0, executeCalldata, adapterParams);
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

async function setValidator(hre, messenger, l1Wallet, ethereumName, opChainName, chainName, validatorAddr, isActive) {
  const { arbitratorAddr, zkLinkAddr, l1GatewayAddr, l2GatewayAddr } = await getContractAddresses(
    ethereumName,
    opChainName,
    chainName,
  );

  // pre-execution calldata
  const zkLink = await hre.ethers.getContractAt('ZkLink', zkLinkAddr);
  const executeCalldata = zkLink.interface.encodeFunctionData('setValidator', [validatorAddr, isActive]);
  const adapterParams = await generateAdapterParams(hre, messenger, l2GatewayAddr, executeCalldata);

  // forward message to L2
  const arbitrator = await hre.ethers.getContractAt('Arbitrator', arbitratorAddr, l1Wallet);
  console.log('Prepare to forward the message to L2...');
  let tx = await arbitrator.setValidator(l1GatewayAddr, validatorAddr, isActive, adapterParams);
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

async function changeFeeParams(hre, messenger, l1Wallet, ethereumName, opChainName, chainName) {
  const { arbitratorAddr, zkLinkAddr, l1GatewayAddr, l2GatewayAddr } = await getContractAddresses(
    ethereumName,
    opChainName,
    chainName,
  );

  // pre-execution calldata
  const zkLink = await hre.ethers.getContractAt('ZkLink', zkLinkAddr);
  const executeCalldata = zkLink.interface.encodeFunctionData('changeFeeParams', [INIT_FEE_PARAMS]);
  const adapterParams = await generateAdapterParams(hre, messenger, l2GatewayAddr, executeCalldata);

  // forward message to L2
  const arbitrator = await hre.ethers.getContractAt('Arbitrator', arbitratorAddr, l1Wallet);
  console.log('Prepare to forward the message to L2...');
  let tx = await arbitrator.changeFeeParams(l1GatewayAddr, INIT_FEE_PARAMS, adapterParams);
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

async function syncL2Requests(hre, messenger, l2Wallet, ethereumName, opChainName, chainName, txs) {
  const { zkLinkAddr } = await getContractAddresses(ethereumName, opChainName, chainName);

  const zkLink = await hre.ethers.getContractAt('ZkLink', zkLinkAddr, l2Wallet);
  const calldata = zkLink.interface.encodeFunctionData('syncL2Requests', [txs]);
  console.log(`The calldata: ${calldata}`);
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
  // const txHash = "0x50af03de3b0edaccb567d2cbc0f6067631c969794f4a93a7bcff68c991465085";
  let status = await messenger.getMessageStatus(txHash);
  console.log(`The message status update to: ${status}`);

  /**
   * Wait until the message is ready to prove
   * This step can take a few minutes.
   */
  await messenger.waitForMessageStatus(txHash, MessageStatus.READY_TO_PROVE);
  /**
   * Once the message is ready to be proven, you'll send an L1 transaction to prove that the message was sent on L2.
   */
  console.log(`Proving the message...`);
  tx = await messenger.proveMessage(txHash);
  console.log(`The prove tx hash: ${tx.hash}`);
  await tx.wait();
  console.log(`The message has been proven`);
  await sleep(60 * 1000); // wait for 12 seconds
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
  tx = await messenger.finalizeMessage(txHash);
  console.log(`The relay tx hash: ${tx.hash}`);
  await tx.wait();
  console.log(`The message has been relayed`);
}

async function encodeSetValidator(hre, messenger, ethereumName, opChainName, chainName, validatorAddr, isActive) {
  const { zkLinkAddr, l1GatewayAddr, l2GatewayAddr } = await getContractAddresses(ethereumName, opChainName, chainName);
  // pre-execution calldata
  const zkLink = await hre.ethers.getContractAt('ZkLink', zkLinkAddr);
  const executeCalldata = zkLink.interface.encodeFunctionData('setValidator', [validatorAddr, isActive]);
  const adapterParams = await generateAdapterParams(hre, messenger, l2GatewayAddr, executeCalldata);

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

async function encodeChangeFeeParams(hre, messenger, ethereumName, opChainName, chainName) {
  const { zkLinkAddr, l1GatewayAddr, l2GatewayAddr } = await getContractAddresses(ethereumName, opChainName, chainName);
  // pre-execution calldata
  const zkLink = await hre.ethers.getContractAt('ZkLink', zkLinkAddr);
  console.log(`The zkLink address: ${zkLink.address}`);
  const executeCalldata = zkLink.interface.encodeFunctionData('changeFeeParams', [INIT_FEE_PARAMS]);
  const adapterParams = await generateAdapterParams(hre, messenger, l2GatewayAddr, executeCalldata);

  const arbitratorFactory = await hre.ethers.getContractFactory('Arbitrator');
  const calldata = arbitratorFactory.interface.encodeFunctionData('changeFeeParams', [
    l1GatewayAddr,
    INIT_FEE_PARAMS,
    adapterParams,
  ]);
  console.log(`The changeFeeParams calldata: ${calldata}`);

  return calldata;
}

module.exports = {
  getContractAddresses,
  syncBatchRoot,
  setValidator,
  changeFeeParams,
  syncL2Requests,
  encodeSetValidator,
  encodeChangeFeeParams,
};
