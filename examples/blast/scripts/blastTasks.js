const blast = require('@eth-optimism/sdk');
const ethers = require('ethers');
const {
  syncBatchRoot,
  getContractAddresses,
  setValidator,
  changeFeeParams,
  encodeSetValidator,
  encodeChangeFeeParams,
  encodeL1ToL2Calldata,
  checkL1TxStatus,
} = require('../../optimism/scripts/opstack-utils');
const {
  MESSAGE_PASSER_ABI,
  MESSAGE_PASSER_ADDRESS,
  OPTIMISM_PORTAL_ABI,
  YIELD_MANAGER_ABI,
  L1_MAINNET_CONTRACTS,
  L1_TESTNET_CONTRACTS,
  YIELD_MANAGER_TESTNET_ADDRESS,
  YIELD_MANAGER_MAINNET_ADDRESS,
} = require('./constants');
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
  const yieldManagerAddress =
    ethereumName !== 'ETHEREUM' ? YIELD_MANAGER_TESTNET_ADDRESS : YIELD_MANAGER_MAINNET_ADDRESS;
  const messenger = new blast.CrossChainMessenger({
    l1ChainId: await l1Wallet.getChainId(),
    l2ChainId: await l2Wallet.getChainId(),
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

  return { messenger, messengerL1Contracts, yieldManagerAddress, ethereumName, blastName };
}

task('depositETH', 'Deposit eth to L2')
  .addParam('amount', 'The deposit amount', undefined, types.string, false)
  .setAction(async taskArgs => {
    const amount = taskArgs.amount;
    console.log(`The deposit amount: ${amount}`);
    const { messenger } = await initMessenger();

    const tx = await messenger.depositETH(ethers.utils.parseEther(amount));
    console.log(`The tx hash: ${tx.hash}`);
    await tx.wait();
    console.log(`Deposit success`);
  });

task('syncBatchRoot', 'Forward message to L2').setAction(async (_, hre) => {
  const { messenger, ethereumName, blastName } = await initMessenger();

  const l2Wallet = messenger.l2Signer;
  const l2CurrentBlock = await l2Wallet.provider.getBlockNumber();
  console.log(`Current block on l2: ${l2CurrentBlock}`);

  const message = await syncBatchRoot(hre, messenger, ethereumName, blastName);

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

    const { messenger, messengerL1Contracts, yieldManagerAddress, ethereumName, blastName } = await initMessenger();
    const l1Wallet = messenger.l1Signer;
    const l2Wallet = messenger.l2Signer;

    const optimismPortalContract = await hre.ethers.getContractAt(
      OPTIMISM_PORTAL_ABI,
      messengerL1Contracts.OptimismPortal,
      l1Wallet,
    );
    console.log(`The optimism portal contract address: ${optimismPortalContract.address}`);

    const yieldManagerContract = await hre.ethers.getContractAt(YIELD_MANAGER_ABI, yieldManagerAddress, l1Wallet);
    console.log(`The yield manager contract address: ${yieldManagerContract.address}`);

    const messagePasserContract = await hre.ethers.getContractAt(MESSAGE_PASSER_ABI, MESSAGE_PASSER_ADDRESS, l2Wallet);
    console.log(`The message passer contract address: ${messagePasserContract.address}`);

    const l2WalletAddress = await l2Wallet.getAddress();
    const l2WalletBalance = ethers.utils.formatEther(await l2Wallet.getBalance());
    console.log(`${l2WalletAddress} balance on l2: ${l2WalletBalance} ether`);

    const { zkLinkAddr } = await getContractAddresses(ethereumName, blastName);

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
    // const txHash = "0xa84e4ec21c6134edc671008d69934cdbc4750fd98ca06f2fe81c20fab8abafb5";
    let receipt = await l2Wallet.provider.getTransactionReceipt(txHash);

    let messageInfos;
    for (const log of receipt.logs) {
      switch (log.address.toLowerCase()) {
        case messagePasserContract.address.toLowerCase(): {
          const parsed = messagePasserContract.interface.parseLog(log);
          if (parsed.name === 'MessagePassed') {
            messageInfos = {
              nonce: parsed.args.nonce,
              sender: parsed.args.sender,
              target: parsed.args.target,
              gasLimit: parsed.args.gasLimit,
              data: parsed.args.data,
              value: parsed.args.value,
            };
          }
        }
      }
    }
    console.log(`The messageInfos: ${JSON.stringify(messageInfos, null, 2)}`);

    const message = (await messenger.getMessagesByTransaction(txHash)).pop();
    let status = await messenger.getMessageStatus(message);
    console.log(`The message status update to: ${blast.MessageStatus[status]}`);
    const feeData = await l1Wallet.getFeeData();

    /**
     * Wait until the message is ready to prove
     * This step can take a few minutes.
     */
    await messenger.waitForMessageStatus(message, blast.MessageStatus.READY_TO_PROVE);
    /**
     * Once the message is ready to be proven, you'll send an L1 transaction to prove that the message was sent on L2.
     */
    console.log(`Proving the message...`);
    tx = await messenger.proveMessage(message, {
      maxFeePerGas: feeData.maxFeePerGas.mul(2),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas.mul(2),
    });
    console.log(`The prove tx hash: ${tx.hash}`);
    await tx.wait();
    console.log(`The message has been proven`);
    let requestId;
    receipt = await l1Wallet.provider.getTransactionReceipt(tx.hash);
    for (const log of receipt.logs) {
      switch (log.address.toLowerCase()) {
        case optimismPortalContract.address.toLowerCase(): {
          const parsed = optimismPortalContract.interface.parseLog(log);
          if (parsed.name === 'WithdrawalProven') {
            requestId = parsed.args.requestId;
          }
        }
      }
    }
    console.log(`The request id: ${requestId}`);
    /**
     * Wait until the message is ready for relay
     * The final step to sending messages from L2 to L1 is to relay the messages on L1. This can only happen after the fault proof period has elapsed. On OP Sepolia, this is only a few seconds. On OP Mainnet, this takes 7 days.
     */
    await messenger.waitForMessageStatus(message, blast.MessageStatus.READY_FOR_RELAY);

    let hintId;
    if (requestId.toNumber() === 0) {
      hintId = 0;
    } else {
      const lastCheckPoint = await yieldManagerContract.getLastCheckpointId();
      hintId = await yieldManagerContract.findCheckpointHint(requestId, 1, lastCheckPoint);
    }
    console.log(`The hint id: ${hintId}`);
    tx = await optimismPortalContract.finalizeWithdrawalTransaction(
      hintId,
      [
        messageInfos.nonce,
        messageInfos.sender,
        messageInfos.target,
        messageInfos.value,
        messageInfos.gasLimit,
        messageInfos.data,
      ],
      {
        maxFeePerGas: feeData.maxFeePerGas.mul(2),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas.mul(2),
      },
    );
    console.log(`The relay tx hash: ${tx.hash}`);
    await tx.wait();
    console.log(`The message has been relayed`);
    console.log('Done!');

    // Example txs:
    // https://sepolia.blastscan.io/tx/0xf482f09c7085be3cbe6d1ef63b7e67d353fbf86cc40455d560a46b5458ecc2b7
    // https://sepolia.etherscan.io/tx/0x96b3e1ab8fc9777f606f032370dec5184c7769ebd9c14647611766d50b3b8c14
  });

task('setValidator', 'Set validator for zkLink')
  .addParam('validator', 'Validator Address', undefined, types.string)
  .addOptionalParam('active', 'Whether to activate the validator address', true, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const validatorAddr = taskArgs.validator;
    const isActive = taskArgs.active;
    console.log(`The validator: address: ${validatorAddr}, active: ${isActive}`);

    const { messenger, ethereumName, blastName } = await initMessenger();

    const l2Wallet = messenger.l2Signer;
    const l2CurrentBlock = await l2Wallet.provider.getBlockNumber();
    console.log(`Current block on l2: ${l2CurrentBlock}`);

    const message = await setValidator(hre, messenger, ethereumName, blastName, validatorAddr, isActive);

    await messenger.waitForMessageStatus(message, blast.MessageStatus.RELAYED);
    const rec = await messenger.getMessageReceipt(message, 0, l2CurrentBlock, 'latest');
    console.log(`The tx receipt: ${JSON.stringify(rec, null, 2)}`);
    console.log('Done');
  });

task('changeFeeParams', 'Change fee params for zkLink').setAction(async (taskArgs, hre) => {
  const { messenger, ethereumName, blastName } = await initMessenger();

  const l2Wallet = messenger.l2Signer;
  const l2CurrentBlock = await l2Wallet.provider.getBlockNumber();
  console.log(`Current block on l2: ${l2CurrentBlock}`);

  const message = await changeFeeParams(hre, messenger, ethereumName, blastName);

  await messenger.waitForMessageStatus(message, blast.MessageStatus.RELAYED);
  const rec = await messenger.getMessageReceipt(message, 0, l2CurrentBlock, 'latest');
  console.log(`The tx receipt: ${JSON.stringify(rec, null, 2)}`);
  console.log('Done');
});

task('encodeChangeFeeParams', 'Get the calldata of changing fee params for zkLink').setAction(async (_, hre) => {
  const { messenger, ethereumName, blastName } = await initMessenger();

  await encodeChangeFeeParams(hre, messenger, ethereumName, blastName);
});

task('encodeSetValidator', 'Get the calldata of set validator for zkLink')
  .addParam('validator', 'Validator Address', undefined, types.string)
  .addOptionalParam('active', 'Whether to activate the validator address', true, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const validatorAddr = taskArgs.validator;
    const isActive = taskArgs.active;
    console.log(`The validator: address: ${validatorAddr}, active: ${isActive}`);

    const { messenger, ethereumName, blastName } = await initMessenger();

    await encodeSetValidator(hre, messenger, ethereumName, blastName, validatorAddr, isActive);
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

    const initInfo = await initMessenger();

    await encodeL1ToL2Calldata(
      hre,
      initInfo.messenger,
      initInfo.ethereumName,
      initInfo.blastName,
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

    const initInfo = await initMessenger();
    await checkL1TxStatus(hre, initInfo.messenger, initInfo.ethereumName, initInfo.blastName, l1TxHash);
  });
