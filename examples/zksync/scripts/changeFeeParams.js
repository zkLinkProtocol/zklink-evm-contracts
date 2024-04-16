const { Provider, Wallet, utils } = require('zksync-ethers');
const { ethers } = require('ethers');
const { readDeployContract, getLogName } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { task } = require('hardhat/config');

require('dotenv').config();

task('changeFeeParams', 'Change fee params for zkLink').setAction(async (taskArgs, hre) => {
  const walletPrivateKey = process.env.DEVNET_PRIVKEY;
  const l1Provider = new Provider(process.env.L1RPC);
  console.log(`Block number: ${await l1Provider.getBlockNumber()}`);

  const l2Provider = new Provider(process.env.L2RPC);
  console.log(`Block number: ${await l2Provider.getBlockNumber()}`);
  const zksyncName = process.env.ZKSYNC;
  const ethereumName = process.env.ETHEREUM;
  const l1Wallet = new ethers.Wallet(walletPrivateKey, l1Provider);
  const zksyncWallet = new Wallet(walletPrivateKey, l2Provider, l1Provider);

  const l1WalletAddress = await l1Wallet.getAddress();
  console.log(`The l1 wallet address: ${l1WalletAddress}`);
  const l1WalletBalance = ethers.formatEther(await l1Provider.getBalance(l1WalletAddress));
  console.log(`${l1WalletAddress} balance on l1: ${l1WalletBalance} ether`);

  const arbitratorAddr = readDeployContract(
    logName.DEPLOY_ARBITRATOR_LOG_PREFIX,
    logName.DEPLOY_LOG_ARBITRATOR,
    ethereumName,
  );
  if (arbitratorAddr === undefined) {
    console.log('arbitrator address not exist');
    return;
  }
  console.log(`The arbitrator address: ${arbitratorAddr}`);

  const zkLinkAddr = readDeployContract(logName.DEPLOY_ZKLINK_LOG_PREFIX, logName.DEPLOY_LOG_ZKLINK_PROXY, zksyncName);
  if (zkLinkAddr === undefined) {
    console.log('zkLink address not exist');
    return;
  }
  console.log(`The zkLink address: ${zkLinkAddr}`);

  const l1GatewayLogName = getLogName(logName.DEPLOY_L1_GATEWAY_LOG_PREFIX, zksyncName);
  const l1GatewayAddr = readDeployContract(l1GatewayLogName, logName.DEPLOY_GATEWAY, ethereumName);
  if (l1GatewayAddr === undefined) {
    console.log('l1 gateway address not exist');
    return;
  }
  console.log(`The l1 gateway address: ${l1GatewayAddr}`);

  const l2GatewayAddr = readDeployContract(logName.DEPLOY_L2_GATEWAY_LOG_PREFIX, logName.DEPLOY_GATEWAY, zksyncName);
  if (l2GatewayAddr === undefined) {
    console.log('l2 gateway address not exist');
    return;
  }
  console.log(`The l2 gateway address: ${l2GatewayAddr}`);
  const { INIT_FEE_PARAMS } = require('../../../script/zksync_era');
  const arbitrator = await hre.ethers.getContractAt('Arbitrator', arbitratorAddr, l1Wallet);
  const zkLinkFactory = await hre.ethers.getContractFactory('ZkLink');
  const zkLinkCallValue = ethers.parseEther('0');
  const zkLinkCallData = zkLinkFactory.interface.encodeFunctionData('changeFeeParams', [INIT_FEE_PARAMS]);
  const l2GatewayFactory = await hre.ethers.getContractFactory('ZkSyncL2Gateway');
  const l2GatewayCallData = l2GatewayFactory.interface.encodeFunctionData('claimMessageCallback', [
    zkLinkCallValue,
    zkLinkCallData,
  ]);

  /**
   * The estimateL1ToL2Execute method gives us the gasLimit for sending an L1->L2 message
   */
  const l1GatewayAliasAddr = utils.applyL1ToL2Alias(l1GatewayAddr);
  const l2GasLimit = await l2Provider.estimateL1ToL2Execute({
    caller: l1GatewayAliasAddr,
    contractAddress: l2GatewayAddr,
    calldata: l2GatewayCallData,
    l2Value: zkLinkCallValue,
    gasPerPubdataByte: utils.REQUIRED_L1_TO_L2_GAS_PER_PUBDATA_LIMIT,
  });
  console.log(`Estimate gasLimit on L1 is ${l2GasLimit.valueOf()}`);

  /**
   * The getGasPrice method gives us the current gas price on L1
   */
  const l1GasPrice = await l1Provider.getGasPrice();
  console.log(`Current gas price on L1 is ${ethers.formatEther(l1GasPrice)} ETH`);

  /**
   * The getBaseCost method gives us the base cost of sending an L1->L2 message
   */
  const baseCost = await zksyncWallet.getBaseCost({
    // L2 computation
    gasLimit: l2GasLimit,
    // L1 gas price
    gasPrice: l1GasPrice,
  });
  console.log(`Executing this transaction will cost ${ethers.formatEther(baseCost)} ETH`);
  console.log(`The msg value: ${BigInt(zkLinkCallValue) + BigInt(baseCost)}`);

  /**
   * We encode the adapter params for the L1->L2 message
   */
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const l2GasPerPubdataByteLimit = 800;
  const adapterParams = abiCoder.encode(['uint256', 'uint256'], [l2GasLimit, l2GasPerPubdataByteLimit]);

  console.log(`Send a l1 message to l2...`);
  const l1Tx = await arbitrator.changeFeeParams(l1GatewayAddr, INIT_FEE_PARAMS, adapterParams, {
    // send the required amount of ETH
    value: BigInt(baseCost) + BigInt(zkLinkCallValue),
    gasPrice: l1GasPrice,
  });
  const l1TxHash = l1Tx.hash;
  console.log(`The l1 tx hash: ${l1TxHash}`);
  await l1Tx.wait();

  /**
   * In principle, a single L1 txn can trigger any number of L1-to-L2 messages (each with its own sequencer number).
   * In this case, we know our txn triggered only one
   * Here, We check if our L1 to L2 message is redeemed on L2
   */
  console.log('Waiting for the L2 execution of the transaction. This may take up to 10-15 minutes ⏰');
  const txHandle = await l1Provider.getTransaction(l1TxHash);
  const l2Tx = await l2Provider.getL2TransactionFromPriorityOp(txHandle);
  console.log(`The l2 tx hash: ${l2Tx.hash}`);
  const l2TxStatus = await l2Provider.getTransactionStatus(l2Tx.hash);
  console.log(`The l2 tx status: ${l2TxStatus}`);
  console.log(`L2 retryable ticket is executed 🥳 `);
});
