const { providers, Wallet, utils } = require('ethers');
const { readDeployContract, getLogName, readDeployLogField } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { ParentTransactionReceipt, ParentToChildMessageStatus, ParentToChildMessageGasEstimator } = require('@arbitrum/sdk');
const { getBaseFee } = require('@arbitrum/sdk/dist/lib/utils/lib');
const { task, types } = require('hardhat/config');

require('dotenv').config();

task('setSecondaryGateway', 'Send secondary gateway')
  .addOptionalParam(
    'arbitrator',
    'The arbitrator address (default get from arbitrator deploy log)',
    undefined,
    types.string,
  )
  .addParam('targetNetwork', 'L2 network name', undefined, types.string, false)
  .addOptionalParam('active', 'Enable the gateway?', true, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const arbitrumName = process.env.ARBITRUM;
    const ethereumName = process.env.ETHEREUM;
    console.log(`Arbitrum net name: ${arbitrumName}`);
    console.log(`Ethereum net name: ${ethereumName}`);

    let arbitratorAddr = taskArgs.arbitrator;
    let targetNetwork = taskArgs.targetNetwork;
    const active = taskArgs.active;
    if (arbitratorAddr === undefined) {
      arbitratorAddr = readDeployLogField(
        logName.DEPLOY_ARBITRATOR_LOG_PREFIX,
        logName.DEPLOY_LOG_ARBITRATOR,
        ethereumName,
      );
    }
    if (targetNetwork === arbitrumName) {
      console.log('Can not set for primary chain');
      return;
    }
    let l1GatewayAddr;
    if (targetNetwork === ethereumName) {
      l1GatewayAddr = readDeployContract(logName.DEPLOY_ETH_GATEWAY_LOG_PREFIX, logName.DEPLOY_GATEWAY, ethereumName);
    } else {
      const l1GatewayLogName = getLogName(logName.DEPLOY_L1_GATEWAY_LOG_PREFIX, targetNetwork);
      l1GatewayAddr = readDeployContract(l1GatewayLogName, logName.DEPLOY_GATEWAY, ethereumName);
    }
    if (l1GatewayAddr === undefined) {
      console.log('L1 gateway address not found');
      return;
    }
    console.log(`The arbitrator address: ${arbitratorAddr}`);
    console.log(`The secondary chain l1 gateway address: ${l1GatewayAddr}`);
    console.log(`Enable the gateway? ${active}`);

    const arbitrumL1GatewayLogName = getLogName(logName.DEPLOY_L1_GATEWAY_LOG_PREFIX, arbitrumName);
    const arbitrumL1GatewayAddr = readDeployContract(arbitrumL1GatewayLogName, logName.DEPLOY_GATEWAY, ethereumName);
    if (arbitrumL1GatewayAddr === undefined) {
      console.log('Arbitrum l1 gateway address not exist');
      return;
    }
    console.log(`The arbitrum l1 gateway address: ${arbitrumL1GatewayAddr}`);

    const arbitrumL2GatewayAddr = readDeployContract(
      logName.DEPLOY_L2_GATEWAY_LOG_PREFIX,
      logName.DEPLOY_GATEWAY,
      arbitrumName,
    );
    if (arbitrumL2GatewayAddr === undefined) {
      console.log('Arbitrum l2 gateway address not exist');
      return;
    }
    console.log(`The arbitrum l2 gateway address: ${arbitrumL2GatewayAddr}`);

    const walletPrivateKey = process.env.DEVNET_PRIVKEY;
    const l1Provider = new providers.JsonRpcProvider(process.env.L1RPC);
    const l2Provider = new providers.JsonRpcProvider(process.env.L2RPC);
    const l1Wallet = new Wallet(walletPrivateKey, l1Provider);
    const l2Wallet = new Wallet(walletPrivateKey, l2Provider);

    /**
     * Now we can query the required gas params using the estimateAll method in Arbitrum SDK
     */
    const l1ToL2MessageGasEstimate = new ParentToChildMessageGasEstimator(l2Provider);

    const l1WalletAddress = await l1Wallet.getAddress();
    const l1WalletBalance = utils.formatEther(await l1Wallet.getBalance());
    console.log(`${l1WalletAddress} balance on l1: ${l1WalletBalance} ether`);

    const arbitrator = await hre.ethers.getContractAt('Arbitrator', arbitratorAddr, l1Wallet);
    const zkLinkFactory = await hre.ethers.getContractAt('IZkSync', hre.ethers.constants.AddressZero);
    const zkLinkCallValue = 0;
    const zkLinkCallData = zkLinkFactory.interface.encodeFunctionData('setSecondaryChainGateway', [
      l1GatewayAddr,
      active,
    ]);
    const l2GatewayFactory = await hre.ethers.getContractFactory('ArbitrumL2Gateway');
    const l2GatewayCallData = l2GatewayFactory.interface.encodeFunctionData('claimMessageCallback', [
      zkLinkCallValue,
      zkLinkCallData,
    ]);

    /**
     * The estimateAll method gives us the following values for sending an L1->L2 message
     * (1) maxSubmissionCost: The maximum cost to be paid for submitting the transaction
     * (2) gasLimit: The L2 gas limit
     * (3) deposit: The total amount to deposit on L1 to cover L2 gas and L2 call value
     */
    const l1BaseFee = await getBaseFee(l1Provider);
    console.log(`Current base fee on L1 is: ${l1BaseFee}`);
    const L1ToL2MessageGasParams = await l1ToL2MessageGasEstimate.estimateAll(
      {
        from: arbitrumL1GatewayAddr,
        to: arbitrumL2GatewayAddr,
        l2CallValue: zkLinkCallValue,
        excessFeeRefundAddress: l1WalletAddress,
        callValueRefundAddress: arbitrumL2GatewayAddr,
        data: l2GatewayCallData,
      },
      l1BaseFee,
      l1Provider,
    );
    console.log(`Current retryable base submission price is: ${L1ToL2MessageGasParams.maxSubmissionCost.toString()}`);
    console.log(`Estimate gasLimit on L2 is: ${L1ToL2MessageGasParams.gasLimit.toString()}`);
    console.log(`Estimate maxFeePerGas on L2 is: ${L1ToL2MessageGasParams.maxFeePerGas.toString()}`);
    console.log(`Estimate fee to pay on L1 is: ${L1ToL2MessageGasParams.deposit.toString()}`);

    const adapterParams = utils.defaultAbiCoder.encode(
      ['uint256', 'uint256', 'uint256'],
      [L1ToL2MessageGasParams.maxSubmissionCost, L1ToL2MessageGasParams.gasLimit, L1ToL2MessageGasParams.maxFeePerGas],
    );
    console.log(`Send a l1 message to l2...`);
    const l1Tx = await arbitrator.setSecondaryChainGateway(l1GatewayAddr, active, adapterParams, {
      value: L1ToL2MessageGasParams.deposit,
    });
    const l1TxHash = l1Tx.hash;
    console.log(`The l1 tx hash: ${l1TxHash}`);
    const arbitratorReceipt = await l1Tx.wait();

    const l1TxReceipt = new ParentTransactionReceipt(arbitratorReceipt);

    /**
     * In principle, a single L1 txn can trigger any number of L1-to-L2 messages (each with its own sequencer number).
     * In this case, we know our txn triggered only one
     * Here, We check if our L1 to L2 message is redeemed on L2
     */
    const messages = await l1TxReceipt.getParentToChildMessages(l2Wallet);
    const message = messages[0];
    console.log('Waiting for the L2 execution of the transaction. This may take up to 10-15 minutes ⏰');
    const messageResult = await message.waitForStatus();
    const status = messageResult.status;
    if (status === ParentToChildMessageStatus.REDEEMED) {
      console.log(`L2 retryable ticket is executed 🥳 ${messageResult.childTxReceipt.transactionHash}`);
    } else {
      console.log(`L2 retryable ticket is failed with status ${ParentToChildMessageStatus[status]}`);
    }
  });
