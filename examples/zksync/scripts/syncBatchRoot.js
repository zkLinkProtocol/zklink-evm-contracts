const { Provider, Wallet, utils } = require('zksync-ethers');
const { ethers } = require('ethers');
const { readDeployContract, getLogName } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { task, types } = require('hardhat/config');

require('dotenv').config();

task('syncBatchRoot', 'Send batch root from arbitrator to zkLink')
  .addParam('value', 'Send msg value in ether', "0", types.string, true)
  .addParam('number', 'The batch number', 50, types.int, true)
  .addParam(
    'hash',
    'The batch root hash',
    '0x9edd5a1d6275b9d57b87490dfbf75fd0f8a9117c91923f2d0fac8c77cc40dace',
    types.string,
    true,
  )
  .setAction(async (taskArgs, hre) => {
    const number = taskArgs.number;
    const hash = taskArgs.hash;
    console.log(`The sync batch: number: ${number}, root hash: ${hash}`);
    const msgValue = taskArgs.value;
    console.log(`The msg value: ${msgValue} ether`);

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

    const zkLinkAddr = readDeployContract(
      logName.DEPLOY_ZKLINK_LOG_PREFIX,
      logName.DEPLOY_LOG_ZKLINK_PROXY,
      zksyncName,
    );
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

    const l2GatewayAddr = readDeployContract(
      logName.DEPLOY_L2_GATEWAY_LOG_PREFIX,
      logName.DEPLOY_GATEWAY,
      zksyncName,
    );
    if (l2GatewayAddr === undefined) {
      console.log('l2 gateway address not exist');
      return;
    }
    console.log(`The l2 gateway address: ${l2GatewayAddr}`);

    const arbitrator = await hre.ethers.getContractAt('DummyArbitrator', arbitratorAddr, l1Wallet);
    const zkLinkFactory = await hre.ethers.getContractFactory('DummyZkLink');
    const zkLinkCallValue = ethers.parseEther(msgValue);
    const zkLinkCallData = zkLinkFactory.interface.encodeFunctionData('syncBatchRoot', [number, hash]);
    const l2GatewayFactory = await hre.ethers.getContractFactory('ZkSyncL2Gateway');
    const l2GatewayCallData = l2GatewayFactory.interface.encodeFunctionData('claimMessage', [
      zkLinkCallValue,
      zkLinkCallData,
    ]);

    /**
     * The estimateL1ToL2Execute method gives us the gasLimit for sending an L1->L2 message
     */
    const l2Addr = utils.applyL1ToL2Alias(l2GatewayAddr);
    const l2GasLimit = await l2Provider.estimateL1ToL2Execute({
      contractAddress: l2Addr,
      calldata: l2GatewayCallData,
      overrides: {
        value: zkLinkCallValue
      }
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
    const adapterParams = abiCoder.encode(
      ['uint256', 'uint256'],
      [l2GasLimit, l2GasPerPubdataByteLimit]
    );

    console.log(`Send a l1 message to l2...`);
    const l1Tx = await arbitrator.forwardMessage(l1GatewayAddr, zkLinkCallValue, zkLinkCallData, adapterParams, {
      // send the required amount of ETH
      value: BigInt(baseCost) + BigInt(zkLinkCallValue),
    });
    const l1TxHash = l1Tx.hash;
    console.log(`The l1 tx hash: ${l1TxHash}`);
    await l1Tx.wait();
    // const l1TxHash = "0xd6c9ecd2461c3d8a753414309ab30d1843d3830269039eb9987f4b491e216f78"

    const txHandle = await l1Provider.getTransaction(l1TxHash);
    console.log(`The txHandle: ${JSON.stringify(txHandle)}`);

    /**
     * In principle, a single L1 txn can trigger any number of L1-to-L2 messages (each with its own sequencer number).
     * In this case, we know our txn triggered only one
     * Here, We check if our L1 to L2 message is redeemed on L2
     */
    console.log('Waiting for the L2 execution of the transaction. This may take up to 10-15 minutes ⏰');
    const l2Tx = await l2Provider.getL2TransactionFromPriorityOp(txHandle);
    console.log(`The l2 tx hash: ${l2Tx.hash}`);
    const l2TxStatus = await l2Provider.getTransactionStatus(l2Tx.hash);
    console.log(`The l2 tx status: ${l2TxStatus}`);
    console.log(`L2 retryable ticket is executed 🥳 `);

    /** Example Txs
     * https://sepolia.etherscan.io/tx/0x10fede986b8c3445db2a0ab2332a97b2b3b682ff79c9fd931898474deb00c86a
     * https://sepolia.explorer.zksync.io/tx/0x202a4975289136b3292bf7b1202e1b8bc540351571d7656d060a489bd7b3509f
     */

  });
