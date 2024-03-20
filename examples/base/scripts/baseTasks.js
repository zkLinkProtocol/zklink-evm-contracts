const base = require('@eth-optimism/sdk');
const ethers = require('ethers');
const {
  syncBatchRoot,
  syncL2Requests,
  setValidator,
  changeFeeParams,
  encodeSetValidator,
  encodeChangeFeeParams,
} = require('../../utils/opstack-utils');
const { L1_MAINNET_CONTRACTS, L1_TESTNET_CONTRACTS } = require('./constants');
const { task, types } = require('hardhat/config');
require('dotenv').config();

async function initMessenger() {
  const walletPrivateKey = process.env.DEVNET_PRIVKEY;
  const l1Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L1RPC);
  const l2Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L2RPC);
  const ethereumName = process.env.ETHEREUM;
  const baseName = process.env.BASE;
  const l1Wallet = new ethers.Wallet(walletPrivateKey, l1Provider);
  const l2Wallet = new ethers.Wallet(walletPrivateKey, l2Provider);

  const messengerL1Contracts = ethereumName !== 'ETHEREUM' ? L1_TESTNET_CONTRACTS : L1_MAINNET_CONTRACTS;
  const messenger = new base.CrossChainMessenger({
    l1ChainId: await l1Wallet.getChainId(), // 11155111 for Sepolia, 1 for Ethereum
    l2ChainId: await l2Wallet.getChainId(), // 84532 for Base Sepolia, 8453 for Base Mainnet
    l1SignerOrProvider: l1Wallet,
    l2SignerOrProvider: l2Wallet,
    bedrock: true,
    contracts: {
      l1: messengerL1Contracts,
    },
  });

  return { messenger, ethereumName, baseName };
}

task('syncBatchRoot', 'Forward message to L2').setAction(async (_, hre) => {
  const { messenger, ethereumName, baseName } = await initMessenger();

  const l2Wallet = messenger.l2Signer;
  const l2CurrentBlock = await l2Wallet.provider.getBlockNumber();
  console.log(`Current block on l2: ${l2CurrentBlock}`);

  const message = await syncBatchRoot(hre, messenger, ethereumName, baseName, 'base');
  // Waiting for the official base bridge to forward the message to L2
  await messenger.waitForMessageStatus(message, base.MessageStatus.RELAYED);
  const rec = await messenger.getMessageReceipt(message, 0, l2CurrentBlock, 'latest');
  console.log(`The tx receipt: ${JSON.stringify(rec, null, 2)}`);
  console.log('Done');

  // Example txs:
  // https://sepolia.etherscan.io/tx/0x00524d9723521e7459581e34013e9a28b5b6d8c4566c3e0b23b2f5fa1726741a
  // https://sepolia.basescan.org/tx/0xcca496f9fa90e776e6d8e696f12a67c639e0786dab9c84628e039ad5af22bcf7
});

task('syncL2Requests', 'Send sync point to arbitrator')
  .addParam('txs', 'New sync point', 100, types.int, true)
  .setAction(async (taskArgs, hre) => {
    const txs = taskArgs.txs;
    console.log(`The sync point: txs: ${txs}`);

    const { messenger, ethereumName, baseName } = await initMessenger();

    await syncL2Requests(hre, messenger, ethereumName, baseName, 'base', txs);

    console.log('Done!');

    // Example txs:
    // https://sepolia.basescan.org/tx/0x5ae6195c0b103bee7fbfb855bf23e9afde809ea2527fa9b0209c63038627959b
    // https://sepolia.etherscan.io/tx/0xb1b968732830a8c0481cecf0a85fdcb3950b2841819154ab4e366c3ee7770834
  });

task('setValidator', 'Set validator for zkLink')
  .addParam('validator', 'Validator Address', undefined, types.string)
  .addOptionalParam('active', 'Whether to activate the validator address', true, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const validatorAddr = taskArgs.validator;
    const isActive = taskArgs.active;
    console.log(`The validator: address: ${validatorAddr}, active: ${isActive}`);

    const { messenger, ethereumName, baseName } = await initMessenger();

    const l2Wallet = messenger.l2Signer;
    const l2CurrentBlock = await l2Wallet.provider.getBlockNumber();
    console.log(`Current block on l2: ${l2CurrentBlock}`);

    const message = await setValidator(hre, messenger, ethereumName, baseName, 'base', validatorAddr, isActive);
    // Waiting for the official base bridge to forward the message to L2
    await messenger.waitForMessageStatus(message, base.MessageStatus.RELAYED);
    const rec = await messenger.getMessageReceipt(message, 0, l2CurrentBlock, 'latest');
    console.log(`The tx receipt: ${JSON.stringify(rec, null, 2)}`);
    console.log('Done');
  });

task('changeFeeParams', 'Change fee params for zkLink').setAction(async (_, hre) => {
  const { messenger, ethereumName, baseName } = await initMessenger();

  const l2Wallet = messenger.l2Signer;
  const l2CurrentBlock = await l2Wallet.provider.getBlockNumber();
  console.log(`Current block on l2: ${l2CurrentBlock}`);

  const message = await changeFeeParams(hre, messenger, ethereumName, baseName, 'base');
  // Waiting for the official base bridge to forward the message to L2
  await messenger.waitForMessageStatus(message, base.MessageStatus.RELAYED);
  const rec = await messenger.getMessageReceipt(message, 0, l2CurrentBlock, 'latest');
  console.log(`The tx receipt: ${JSON.stringify(rec, null, 2)}`);
  console.log('Done');
});

task('encodeChangeFeeParams', 'Get the calldata of changing fee params for zkLink').setAction(async (_, hre) => {
  const { messenger, ethereumName, baseName } = await initMessenger();

  await encodeChangeFeeParams(hre, messenger, ethereumName, baseName, 'base');
});

task('encodeSetValidator', 'Get the calldata of set validator for zkLink')
  .addParam('validator', 'Validator Address', undefined, types.string)
  .addOptionalParam('active', 'Whether to activate the validator address', true, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const validatorAddr = taskArgs.validator;
    const isActive = taskArgs.active;
    console.log(`The validator: address: ${validatorAddr}, active: ${isActive}`);

    const { messenger, ethereumName, baseName } = await initMessenger();

    await encodeSetValidator(hre, messenger, ethereumName, baseName, 'base', validatorAddr, isActive);
  });
