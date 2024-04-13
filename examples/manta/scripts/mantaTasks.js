const manta = require('@eth-optimism/sdk');
const ethers = require('ethers');
const {
  syncBatchRoot,
  syncL2Requests,
  setValidator,
  changeFeeParams,
  encodeSetValidator,
  encodeChangeFeeParams,
  encodeL1ToL2Calldata,
  checkL1TxStatus,
} = require('../../optimism/scripts/opstack-utils');
const { L1_MAINNET_CONTRACTS, L1_TESTNET_CONTRACTS } = require('./constants');
const { task, types } = require('hardhat/config');
const { suggestFees } = require('@rainbow-me/fee-suggestions');
require('dotenv').config();

async function initMessenger() {
  const walletPrivateKey = process.env.DEVNET_PRIVKEY;
  const l1Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L1RPC);
  const l2Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L2RPC);
  const ethereumName = process.env.ETHEREUM;
  const mantaName = process.env.MANTA;
  const l1Wallet = new ethers.Wallet(walletPrivateKey, l1Provider);
  const l2Wallet = new ethers.Wallet(walletPrivateKey, l2Provider);
  // https://github.com/Manta-Network/bridging-tutorial/blob/ad640a17264e2f009065811a0ff0872d8063b27b/standard-bridge-custom-token/README.md?plain=1#L152
  const messengerL1Contracts = ethereumName !== 'ETHEREUM' ? L1_TESTNET_CONTRACTS : L1_MAINNET_CONTRACTS;
  const messenger = new manta.CrossChainMessenger({
    l1ChainId: await l1Wallet.getChainId(),
    l2ChainId: await l2Wallet.getChainId(),
    l1SignerOrProvider: l1Wallet,
    l2SignerOrProvider: l2Wallet,
    bedrock: true,
    contracts: {
      l1: messengerL1Contracts,
    },
  });

  return { messenger, ethereumName, mantaName };
}

task('syncBatchRoot', 'Forward message to L2').setAction(async (_, hre) => {
  const { messenger, ethereumName, mantaName } = await initMessenger();

  const message = await syncBatchRoot(hre, messenger, ethereumName, mantaName);
  // Waiting for the official manta bridge to forward the message to L2
  const rec = await messenger.waitForMessageReceipt(message);
  console.log(`The tx receipt: ${JSON.stringify(rec, null, 2)}`);
  console.log('Done');

  // Example txs:
  // https://goerli.etherscan.io/tx/0x12b283959163783e7faf186b70fd4513560a3a41f79099f56ae984c2ac81be6d
  // https://pacific-explorer.testnet.manta.network/tx/0xbce746d631ac613b61f224138779cbcf3a2f744864b50443440c1c9346cc4c11
});

task('syncL2Requests', 'Send sync point to arbitrator')
  .addParam('txs', 'New sync point', 100, types.int, true)
  .setAction(async (taskArgs, hre) => {
    const txs = taskArgs.txs;
    console.log(`The sync point: txs: ${txs}`);

    const { messenger, ethereumName, mantaName } = await initMessenger();

    await syncL2Requests(hre, messenger, ethereumName, mantaName, txs);

    console.log('Done!');

    // Example txs:
    // https://pacific-explorer.testnet.manta.network/tx/0x1a81ed28c1b74120753b0edf3d98e80b814ec5f065ad44b26c0cd6131dc04d22
    // https://goerli.etherscan.io/tx/0x54ce6421e1d9c1e7d2c35af292c9e3bbaf632b60115556a94b7fb61e53905599
  });

task('proveL2Tx', 'Prove L2 tx')
  .addParam('txHash', 'The tx hash to prove', undefined, types.string)
  .setAction(async taskArgs => {
    const txHash = taskArgs.txHash;
    console.log(`The l2 tx hash: ${txHash}`);

    const { messenger } = await initMessenger();

    const status = await messenger.getMessageStatus(txHash);
    console.log(`The message status update to: ${manta.MessageStatus[status]}`);

    const fees = await suggestFees(messenger.l1Provider);
    console.log(`The suggest fees: ${JSON.stringify(fees)}`);
    const baseFee = ethers.BigNumber.from(fees.baseFeeSuggestion);
    const maxPriorityFeePerGas = ethers.BigNumber.from(fees.maxPriorityFeeSuggestions.fast);
    const maxFeePerGas = maxPriorityFeePerGas.add(baseFee.mul(ethers.BigNumber.from(2)));
    /**
     * Wait until the message is ready to prove
     * This step can take a few minutes.
     */
    await messenger.waitForMessageStatus(txHash, manta.MessageStatus.READY_TO_PROVE);
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
  const { messenger, ethereumName, mantaName } = await initMessenger();

  const message = await changeFeeParams(hre, messenger, ethereumName, mantaName);

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

    const { messenger, ethereumName, mantaName } = await initMessenger();

    const message = await setValidator(hre, messenger, ethereumName, mantaName, validatorAddr, isActive);

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

    const { ethereumName, mantaName } = await initMessenger();

    await encodeSetValidator(hre, ethereumName, mantaName, validatorAddr, isActive);
  });

task('encodeChangeFeeParams', 'Get the calldata of changing fee params for zkLink').setAction(async (_, hre) => {
  const { ethereumName, mantaName } = await initMessenger();

  await encodeChangeFeeParams(hre, ethereumName, mantaName);
});

task('encodeL1ToL2Calldata', 'Encode call data for l1 to l2')
  .addParam('to', 'The l2 target address', undefined, types.string)
  .addParam('l2CallData', 'The l2 call data to target address', undefined, types.string)
  .addParam('l2CallValue', 'The l2 call value to target address', undefined, types.int)
  .setAction(async (taskArgs, hre) => {
    const l2ToContractAddress = taskArgs.to;
    const l2CallData = taskArgs.l2CallData;
    const l2CallValue = taskArgs.l2CallValue;
    console.log(`The l2 target contract address: ${l2ToContractAddress}`);
    console.log(`The l2 call data to target address: ${l2CallData}`);
    console.log(`The l2 call value to target address: ${l2CallValue}`);

    const { messenger, ethereumName, mantaName } = await initMessenger();

    await encodeL1ToL2Calldata(hre, messenger, ethereumName, mantaName, l2ToContractAddress, l2CallData, l2CallValue);
  });

task('checkL1TxStatus', 'Check the l1 tx status')
  .addParam('l1TxHash', 'The l1 tx hash', undefined, types.string)
  .setAction(async (taskArgs, hre) => {
    const l1TxHash = taskArgs.l1TxHash;
    console.log(`The l1 tx hash: ${l1TxHash}`);

    const { messenger, ethereumName, mantaName } = await initMessenger();
    await checkL1TxStatus(hre, messenger, ethereumName, mantaName, l1TxHash);
  });
