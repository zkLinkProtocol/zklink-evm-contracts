const optimism = require('@eth-optimism/sdk');
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
} = require('./opstack-utils');
const { task, types } = require('hardhat/config');
require('dotenv').config();

async function initMessenger() {
  const walletPrivateKey = process.env.DEVNET_PRIVKEY;
  const l1Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L1RPC);
  const l2Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L2RPC);
  const ethereumName = process.env.ETHEREUM;
  const optimismName = process.env.OPTIMISM;
  const l1Wallet = new ethers.Wallet(walletPrivateKey, l1Provider);
  const l2Wallet = new ethers.Wallet(walletPrivateKey, l2Provider);
  const messenger = new optimism.CrossChainMessenger({
    l1ChainId: await l1Wallet.getChainId(), // 11155111 for Sepolia, 1 for Ethereum
    l2ChainId: await l2Wallet.getChainId(), // 11155420 for OP Sepolia, 10 for OP Mainnet
    l1SignerOrProvider: l1Wallet,
    l2SignerOrProvider: l2Wallet,
  });

  return { messenger, ethereumName, optimismName };
}

task('syncBatchRoot', 'Forward message to L2').setAction(async (_, hre) => {
  const { messenger, ethereumName, optimismName } = await initMessenger();

  const message = await syncBatchRoot(hre, messenger, ethereumName, optimismName);
  // Waiting for the official optimism bridge to forward the message to L2
  const rec = await messenger.waitForMessageReceipt(message);
  console.log(`The tx receipt: ${JSON.stringify(rec, null, 2)}`);
  console.log('Done');

  // Example txs:
  // https://sepolia.etherscan.io/tx/0x4245b341b159a79d6cf35b917b849ccc8d5b3ae6fac947bc7376650844bdc43c
  // https://sepolia-optimistic.etherscan.io/tx/0x7779fbaf0358f34d2303d77019d09c39a0a0b178d9f6c4235c7bc5519ba9b58b
});

task('syncL2Requests', 'Send sync point to arbitrator')
  .addParam('txs', 'New sync point', 100, types.int, true)
  .setAction(async (taskArgs, hre) => {
    const txs = taskArgs.txs;
    console.log(`The sync point: txs: ${txs}`);

    const { messenger, ethereumName, optimismName } = await initMessenger();

    await syncL2Requests(hre, messenger, ethereumName, optimismName, txs);

    console.log('Done! Your transaction is executed');

    // Example txs:
    // https://sepolia-optimistic.etherscan.io/tx/0xd1be4141ad192ddb978bfb324aaa41c2bddfdabce159de710e658db98d7c6885
    // https://sepolia.etherscan.io/tx/0x18be026ceed349625363f84a75c0384e69c549a972d79e78f327c2a1647a183d
  });

task('setValidator', 'Set validator for zkLink')
  .addParam('validator', 'Validator Address', undefined, types.string)
  .addOptionalParam('active', 'Whether to activate the validator address', true, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const validatorAddr = taskArgs.validator;
    const isActive = taskArgs.active;
    console.log(`The validator: address: ${validatorAddr}, active: ${isActive}`);

    const { messenger, ethereumName, optimismName } = await initMessenger();

    const message = await setValidator(hre, messenger, ethereumName, optimismName, validatorAddr, isActive);
    // Waiting for the official optimism bridge to forward the message to L2
    const rec = await messenger.waitForMessageReceipt(message);
    console.log(`The tx receipt: ${JSON.stringify(rec, null, 2)}`);
    console.log('Done');
  });

task('changeFeeParams', 'Change fee params for zkLink').setAction(async (_, hre) => {
  const { messenger, ethereumName, optimismName } = await initMessenger();

  const message = await changeFeeParams(hre, messenger, ethereumName, optimismName);

  // Waiting for the official optimism bridge to forward the message to L2
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

    const { ethereumName, optimismName } = await initMessenger();

    await encodeSetValidator(hre, ethereumName, optimismName, validatorAddr, isActive);
  });

task('encodeChangeFeeParams', 'Get the calldata of changing fee params for zkLink').setAction(async (_, hre) => {
  const { ethereumName, optimismName } = await initMessenger();

  await encodeChangeFeeParams(hre, ethereumName, optimismName);
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

    const { messenger, ethereumName, optimismName } = await initMessenger();

    await encodeL1ToL2Calldata(
      hre,
      messenger,
      ethereumName,
      optimismName,
      l2ToContractAddress,
      l2CallData,
      l2CallValue,
    );
  });

task('checkL1TxStatus', 'Check the l1 tx status')
  .addParam('l1TxHash', 'The l1 tx hash', undefined, types.string)
  .setAction(async (taskArgs, hre) => {
    const l1TxHash = taskArgs.l1TxHash;
    console.log(`The l1 tx hash: ${l1TxHash}`);

    const { messenger, ethereumName, optimismName } = await initMessenger();
    await checkL1TxStatus(hre, messenger, ethereumName, optimismName, l1TxHash);
  });
