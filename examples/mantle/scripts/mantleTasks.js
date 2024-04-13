const mantle = require('@mantleio/sdk');
const { applyL1ToL2Alias } = require('@mantleio/core-utils');
const ethers = require('ethers');
const { BigNumber, Contract } = require('ethers');
const { suggestFees } = require('@rainbow-me/fee-suggestions');
const {
  syncBatchRoot,
  syncL2Requests,
  setValidator,
  changeFeeParams,
  encodeSetValidator,
  encodeChangeFeeParams,
  checkL1TxStatus,
} = require('../../optimism/scripts/opstack-utils');
const { zkLinkConfig } = require('../../../script/zklink_config');
const { readDeployContract } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { task, types } = require('hardhat/config');
require('dotenv').config();

async function initMessenger() {
  const walletPrivateKey = process.env.DEVNET_PRIVKEY;
  const l1Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L1RPC);
  const l2Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L2RPC);
  const mantleName = process.env.MANTLE;
  const ethereumName = process.env.ETHEREUM;
  const l1Wallet = new ethers.Wallet(walletPrivateKey, l1Provider);
  const l2Wallet = new ethers.Wallet(walletPrivateKey, l2Provider);
  const messenger = new mantle.CrossChainMessenger({
    l1ChainId: await l1Wallet.getChainId(),
    l2ChainId: await l2Wallet.getChainId(),
    l1SignerOrProvider: l1Wallet,
    l2SignerOrProvider: l2Wallet,
    bedrock: true,
  });

  return { messenger, ethereumName, mantleName };
}

task('syncBatchRoot', 'Forward message to L2').setAction(async (_, hre) => {
  const { messenger, ethereumName, mantleName } = await initMessenger();

  const message = await syncBatchRoot(hre, messenger, ethereumName, mantleName);
  // Waiting for the official manta bridge to forward the message to L2
  const rec = await messenger.waitForMessageReceipt(message);
  console.log(`The tx receipt: ${JSON.stringify(rec, null, 2)}`);
  console.log('Done');

  // Example txs:
  // https://sepolia.etherscan.io/tx/0x021a7a2eb1bf46dbfc1fe91da1c4f85b2891195482fa097d69b7b53bd8b4f041
  // https://sepolia.mantlescan.xyz/tx/0x97e054f0c3bc5b9033834eb88c59730716e275e460849b489bc7eff86b332225
});

task('syncL2Requests', 'Send sync point to arbitrator')
  .addParam('txs', 'New sync point', 100, types.int, true)
  .setAction(async (taskArgs, hre) => {
    const txs = taskArgs.txs;
    console.log(`The sync point: txs: ${txs}`);

    const { messenger, ethereumName, mantleName } = await initMessenger();

    await syncL2Requests(hre, messenger, ethereumName, mantleName, txs);

    console.log('Done!');

    // Example txs:
    // https://sepolia.mantlescan.xyz/tx/0xfacef5c27c52fc60e059e36c7fb5fd897cd3b85b0861cbaa0fe299c1ca23101b
    // https://sepolia.etherscan.io/tx/0x1a0f721a5d0c4bcc334ad6d54a60ae4ce4b5e52c71f3e48f62e2f2c980885b61
  });

task('proveL2Tx', 'Prove L2 tx')
  .addParam('txHash', 'The tx hash to prove', undefined, types.string)
  .setAction(async taskArgs => {
    const txHash = taskArgs.txHash;
    console.log(`The l2 tx hash: ${txHash}`);

    const { messenger } = await initMessenger();

    const status = await messenger.getMessageStatus(txHash);
    console.log(`The message status update to: ${mantle.MessageStatus[status]}`);

    const fees = await suggestFees(messenger.l1Provider);
    console.log(`The suggest fees: ${JSON.stringify(fees)}`);
    const baseFee = BigNumber.from(fees.baseFeeSuggestion);
    const maxPriorityFeePerGas = BigNumber.from(fees.maxPriorityFeeSuggestions.fast);
    const maxFeePerGas = maxPriorityFeePerGas.add(baseFee.mul(BigNumber.from(2)));
    /**
     * Wait until the message is ready to prove
     * This step can take a few minutes.
     */
    await messenger.waitForMessageStatus(txHash, mantle.MessageStatus.READY_TO_PROVE);
    /**
     * Once the message is ready to be proven, you'll send an L1 transaction to prove that the message was sent on L2.
     */
    console.log(`Proving the message...`);
    const tx = await messenger.proveMessage(txHash, {
      maxFeePerGas: maxFeePerGas,
      maxPriorityFeePerGas: maxPriorityFeePerGas,
    });
    console.log(`The prove tx hash: ${tx.hash}`);
    await tx.wait();
    console.log(`The message has been proven`);
  });

task('changeFeeParams', 'Change fee params for zkLink').setAction(async (_, hre) => {
  const { messenger, ethereumName, mantleName } = await initMessenger();

  const message = await changeFeeParams(hre, messenger, ethereumName, mantleName);

  // Waiting for the official manta bridge to forward the message to L2
  const rec = await messenger.waitForMessageReceipt(message);
  console.log(`The tx receipt: ${JSON.stringify(rec, null, 2)}`);
  console.log('Done');
});

task('setValidator', 'Set validator for zkLink')
  .addParam('validator', 'Validator Address', undefined, types.string)
  .addOptionalParam('active', 'Whether to activate the validator address', true, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const validatorAddr = taskArgs.validator;
    const isActive = taskArgs.active;
    console.log(`The validator: address: ${validatorAddr}, active: ${isActive}`);

    const { messenger, ethereumName, mantleName } = await initMessenger();

    const message = await setValidator(hre, messenger, ethereumName, mantleName, validatorAddr, isActive);

    // Waiting for the official manta bridge to forward the message to L2
    const rec = await messenger.waitForMessageReceipt(message);
    console.log(`The tx receipt: ${JSON.stringify(rec, null, 2)}`);
    console.log('Done');
  });

task('encodeSetValidator', 'Get the calldata of set validator for zkLink')
  .addParam('validator', 'Validator Address', undefined, types.string)
  .addOptionalParam('active', 'Whether to activate the validator address', true, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const validatorAddr = taskArgs.validator;
    const isActive = taskArgs.active;
    console.log(`The validator: address: ${validatorAddr}, active: ${isActive}`);

    const { ethereumName, mantleName } = await initMessenger();

    await encodeSetValidator(hre, ethereumName, mantleName, validatorAddr, isActive);
  });

task('encodeChangeFeeParams', 'Get the calldata of changing fee params for zkLink').setAction(async (_, hre) => {
  const { ethereumName, mantleName } = await initMessenger();

  await encodeChangeFeeParams(hre, ethereumName, mantleName);
});

task('encodeL1ToL2Calldata', 'Encode call data for l1 to l2')
  .addParam('to', 'The l2 target address', undefined, types.string)
  .addParam('l2CallData', 'The l2 call data to target address', undefined, types.string)
  .addParam('l2CallValue', 'The l2 call value to target address', undefined, types.int)
  .setAction(async taskArgs => {
    const l2ToContractAddress = taskArgs.to;
    const l2CallData = taskArgs.l2CallData;
    const l2CallValue = taskArgs.l2CallValue;
    console.log(`The l2 target contract address: ${l2ToContractAddress}`);
    console.log(`The l2 call data to target address: ${l2CallData}`);
    console.log(`The l2 call value to target address: ${l2CallValue}`);

    const { messenger, ethereumName, mantleName: opChainName } = await initMessenger();

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
    const l2GovernanceBalance = await l2Provider.getBalance(l2GovernanceAddr);
    console.log(`The l2 governance balance: ${l2GovernanceBalance.toString()}`);
    if (l2GovernanceBalance.eq(BigNumber.from(0))) {
      console.log(`Estimate gas will failed with error: insufficient funds for transfer`);
      console.log(`Please transfer some mnt token to the l2 governance address for estimating gas`);
      return;
    }
    let l2GasLimit = await l2Provider.estimateGas({
      from: l2GovernanceAddr,
      to: l2ToContractAddress,
      data: l2CallData,
      value: l2CallValue,
    });
    const tokenRatioAbi =
      '[{\n' +
      '        "inputs": [],\n' +
      '        "name": "tokenRatio",\n' +
      '        "outputs": [\n' +
      '            {\n' +
      '                "internalType": "uint256",\n' +
      '                "name": "",\n' +
      '                "type": "uint256"\n' +
      '            }\n' +
      '        ],\n' +
      '        "stateMutability": "view",\n' +
      '        "type": "function"\n' +
      '    }]';
    const tokenRatioInterface = new ethers.utils.Interface(tokenRatioAbi);
    const l2GasPriceOracle = new Contract(
      messenger.contracts.l2.BVM_GasPriceOracle.address,
      tokenRatioInterface,
      l2Provider,
    );
    const tokenRatio = await l2GasPriceOracle.tokenRatio();
    console.log(`The eth/mnt token ratio: ${tokenRatio}`);
    l2GasLimit = l2GasLimit.div(BigNumber.from(tokenRatio));
    console.log(`The l2 gas limit: ${l2GasLimit.toString()}`);
    l2GasLimit = l2GasLimit.mul(120).div(100); // Add 20% buffer
    console.log(`The l2 gas limit: ${l2GasLimit.toString()}`);

    const sendMessageCalldata = portalContract.interface.encodeFunctionData('depositTransaction', [
      l2CallValue,
      l2ToContractAddress,
      l2CallValue,
      l2GasLimit,
      false,
      l2CallData,
    ]);
    console.log(`The l1 to l2 call target: ${portalContract.address}`);
    console.log(`The l1 to l2 call data: ${sendMessageCalldata}`);
    console.log(`The l1 to l2 call value: ${l2CallValue}`);
  });

task('checkL1TxStatus', 'Check the l1 tx status')
  .addParam('l1TxHash', 'The l1 tx hash', undefined, types.string)
  .setAction(async (taskArgs, hre) => {
    const l1TxHash = taskArgs.l1TxHash;
    console.log(`The l1 tx hash: ${l1TxHash}`);

    const { messenger, ethereumName, mantleName } = await initMessenger();
    await checkL1TxStatus(hre, messenger, ethereumName, mantleName, l1TxHash);
  });
