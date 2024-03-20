const blast = require('@eth-optimism/sdk');
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
  const blastName = process.env.BLAST;
  const ethereumName = process.env.ETHEREUM;
  const l1Wallet = new ethers.Wallet(walletPrivateKey, l1Provider);
  const l2Wallet = new ethers.Wallet(walletPrivateKey, l2Provider);

  const messengerL1Contracts = ethereumName !== 'ETHEREUM' ? L1_TESTNET_CONTRACTS : L1_MAINNET_CONTRACTS;
  const messenger = new blast.CrossChainMessenger({
    l1ChainId: await l1Wallet.getChainId(), // 11155111 for Sepolia, 1 for Ethereum
    l2ChainId: await l2Wallet.getChainId(), // 168587773 for Blast Testnet, 81457 for Blast Mainnet
    l1SignerOrProvider: l1Wallet,
    l2SignerOrProvider: l2Wallet,
    bedrock: true,
    bridges: {
      Standard: {
        Adapter: blast.StandardBridgeAdapter,
        l1Bridge: messengerL1Contracts.L1StandardBridge,
        l2Bridge: '0x4200000000000000000000000000000000000010',
      },
    },
    contracts: {
      l1: messengerL1Contracts,
    },
  });

  return { l1Wallet, l2Wallet, messenger, ethereumName, blastName };
}

task('syncBatchRoot', 'Forward message to L2').setAction(async (_, hre) => {
  const { l1Wallet, l2Wallet, messenger, ethereumName, blastName } = await initMessenger();

  const l1WalletAddress = await l1Wallet.getAddress();
  const l1WalletBalance = ethers.utils.formatEther(await l1Wallet.getBalance());
  console.log(`${l1WalletAddress} balance on l1: ${l1WalletBalance} ether`);
  const l2CurrentBlock = await l2Wallet.provider.getBlockNumber();
  console.log(`Current block on l2: ${l2CurrentBlock}`);

  const message = await syncBatchRoot(hre, messenger, l1Wallet, l2Wallet.provider, ethereumName, blastName, 'blast');

  await messenger.waitForMessageStatus(message, blast.MessageStatus.RELAYED);
  const rec = await messenger.getMessageReceipt(message, 0, l2CurrentBlock, 'latest');
  console.log(`The tx receipt: ${JSON.stringify(rec, null, 2)}`);
  console.log('Done');

  // Example txs:
  // https://sepolia.etherscan.io/tx/0xfa6168b68e37d2838589733b0dce76d0e489ade267627f3371546935b2aa393d
  // https://sepolia.blastscan.io/tx/0x77c77aa0ebcdcc1537eee9fa00cab394332608228e2d8fcff0eefb422d2bb451
});

task('syncL2Requests', 'Send sync point to arbitrator')
  .addParam('txs', 'New sync point', 100, types.int, true)
  .setAction(async (taskArgs, hre) => {
    const txs = taskArgs.txs;
    console.log(`The sync point: txs: ${txs}`);

    const { l2Wallet, messenger, ethereumName, blastName } = await initMessenger();

    // const optimismPortalContract = await hre.ethers.getContractAt(
    //   OPTIMISM_PORTAL_ABI,
    //   messengerL1Contracts.OptimismPortal,
    //   l1Wallet,
    // );
    // console.log(`The optimism portal contract address: ${optimismPortalContract.address}`);

    // const yieldManagerContract = await hre.ethers.getContractAt(YIELD_MANAGER_ABI, yieldManagerAddress, l1Wallet);
    // console.log(`The yield manager contract address: ${yieldManagerContract.address}`);

    const l2WalletAddress = await l2Wallet.getAddress();
    const l2WalletBalance = ethers.utils.formatEther(await l2Wallet.getBalance());
    console.log(`${l2WalletAddress} balance on l2: ${l2WalletBalance} ether`);

    await syncL2Requests(hre, messenger, l2Wallet, ethereumName, blastName, 'blast', txs);
    console.log('Done!');

    // Example txs:
    //
    //
  });

task('setValidator', 'Set validator for zkLink')
  .addParam('validator', 'Validator Address', undefined, types.string)
  .addOptionalParam('active', 'Whether to activate the validator address', true, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const validatorAddr = taskArgs.validator;
    const isActive = taskArgs.active;
    console.log(`The validator: address: ${validatorAddr}, active: ${isActive}`);

    const { l1Wallet, l2Wallet, messenger, ethereumName, blastName } = await initMessenger();

    const l1WalletAddress = await l1Wallet.getAddress();
    const l1WalletBalance = ethers.utils.formatEther(await l1Wallet.getBalance());
    console.log(`${l1WalletAddress} balance on l1: ${l1WalletBalance} ether`);
    const l2CurrentBlock = await l2Wallet.provider.getBlockNumber();
    console.log(`Current block on l2: ${l2CurrentBlock}`);

    const message = await setValidator(
      hre,
      messenger,
      l1Wallet,
      ethereumName,
      blastName,
      'blast',
      validatorAddr,
      isActive,
    );

    await messenger.waitForMessageStatus(message, blast.MessageStatus.RELAYED);
    const rec = await messenger.getMessageReceipt(message, 0, l2CurrentBlock, 'latest');
    console.log(`The tx receipt: ${JSON.stringify(rec, null, 2)}`);
    console.log('Done');
  });

task('changeFeeParams', 'Change fee params for zkLink').setAction(async (taskArgs, hre) => {
  const { l1Wallet, l2Wallet, messenger, ethereumName, blastName } = await initMessenger();

  const l1WalletAddress = await l1Wallet.getAddress();
  const l1WalletBalance = ethers.utils.formatEther(await l1Wallet.getBalance());
  console.log(`${l1WalletAddress} balance on l1: ${l1WalletBalance} ether`);
  const l2CurrentBlock = await l2Wallet.provider.getBlockNumber();
  console.log(`Current block on l2: ${l2CurrentBlock}`);

  const message = await changeFeeParams(hre, messenger, l1Wallet, ethereumName, blastName, 'blast');

  await messenger.waitForMessageStatus(message, blast.MessageStatus.RELAYED);
  const rec = await messenger.getMessageReceipt(message, 0, l2CurrentBlock, 'latest');
  console.log(`The tx receipt: ${JSON.stringify(rec, null, 2)}`);
  console.log('Done');
});

task('encodeChangeFeeParams', 'Get the calldata of changing fee params for zkLink').setAction(async (_, hre) => {
  const { messenger, ethereumName, blastName } = await initMessenger();

  await encodeChangeFeeParams(hre, messenger, ethereumName, blastName, 'blast');
});

task('encodeSetValidator', 'Get the calldata of set validator for zkLink')
  .addParam('validator', 'Validator Address', undefined, types.string)
  .addOptionalParam('active', 'Whether to activate the validator address', true, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const validatorAddr = taskArgs.validator;
    const isActive = taskArgs.active;
    console.log(`The validator: address: ${validatorAddr}, active: ${isActive}`);

    const { messenger, ethereumName, blastName } = await initMessenger();

    await encodeSetValidator(hre, messenger, ethereumName, blastName, 'blast', validatorAddr, isActive);
  });
