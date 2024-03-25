const manta = require('@eth-optimism/sdk');
const ethers = require('ethers');
const {
  syncBatchRoot,
  syncL2Requests,
  setValidator,
  changeFeeParams,
  encodeSetValidator,
  encodeChangeFeeParams,
} = require('../../optimism/scripts/opstack-utils');
const { L1_MAINNET_CONTRACTS, L1_TESTNET_CONTRACTS } = require('./constants');
const { task, types } = require('hardhat/config');
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
    l1ChainId: await l1Wallet.getChainId(), // 5 for Goerli, 1 for Ethereum
    l2ChainId: await l2Wallet.getChainId(), // 3441005 for Manta Pacific Testnet, 169 for Manta Pacific Mainnet
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

    const { messenger, ethereumName, mantaName } = await initMessenger();

    await encodeSetValidator(hre, messenger, ethereumName, mantaName, validatorAddr, isActive);
  });

task('encodeChangeFeeParams', 'Get the calldata of changing fee params for zkLink').setAction(async (_, hre) => {
  const { messenger, ethereumName, mantaName } = await initMessenger();

  await encodeChangeFeeParams(hre, messenger, ethereumName, mantaName);
});
