const { JsonRpcProvider, Wallet, formatEther } = require('ethers');
const { task, types } = require('hardhat/config');
const { ScrollSDK } = require('./scrollSDK');

require('dotenv').config();

task('checkL1TxStatus', 'Check the l1 tx status')
  .addParam('txHash', 'The l1 tx hash', undefined, types.string, false)
  .addParam('l2FromBlock', 'The l2 from block to query', undefined, types.int, false)
  .setAction(async taskArgs => {
    const l1TxHash = taskArgs.txHash;
    const l2FromBlock = taskArgs.l2FromBlock;
    console.log(`The l1 tx hash: ${l1TxHash}, l2 from block number: ${l2FromBlock}`);

    const l1Provider = new JsonRpcProvider(process.env.L1RPC);
    const l2Provider = new JsonRpcProvider(process.env.L2RPC);
    const ethereumName = process.env.ETHEREUM;
    const scrollSDK = new ScrollSDK(ethereumName, l1Provider, l2Provider);

    const sentMessage = await scrollSDK.getSentMessage(l1TxHash);
    console.log(`The l1 to l2 sent message: ${JSON.stringify(sentMessage)}`);

    const xDomainHash = scrollSDK.xDomainCalldataHash(
      sentMessage.sender,
      sentMessage.target,
      sentMessage.value,
      sentMessage.messageNonce,
      sentMessage.message,
    );
    console.log(`The xDomain hash: ${xDomainHash}`);
    const l2TxReceipt = await scrollSDK.getL2TxReceipt(xDomainHash, l2FromBlock, l2FromBlock + 600);
    console.log(`The l2 tx confirmed: ${l2TxReceipt.hash}`);
  });

task('claimL2Tx', 'Claim the l2 tx')
  .addParam('txHash', 'The l2 tx hash', undefined, types.string, false)
  .setAction(async taskArgs => {
    const l2TxHash = taskArgs.txHash;
    console.log(`The l2 tx hash: ${l2TxHash}`);

    const walletPrivateKey = process.env.DEVNET_PRIVKEY;
    const l1Provider = new JsonRpcProvider(process.env.L1RPC);
    const l2Provider = new JsonRpcProvider(process.env.L2RPC);
    const ethereumName = process.env.ETHEREUM;
    const scrollSDK = new ScrollSDK(ethereumName, l1Provider, l2Provider);
    const l1Wallet = new Wallet(walletPrivateKey, l1Provider);

    const l1WalletAddress = await l1Wallet.getAddress();
    const l1WalletBalance = formatEther(await l1Provider.getBalance(l1WalletAddress));
    console.log(`${l1WalletAddress} balance on l1: ${l1WalletBalance} ether`);

    let claimInfo = await scrollSDK.getL2ToL1TxClaimInfo(l2TxHash);
    if (!claimInfo) {
      console.log(`Tx not claimable`);
      return;
    }
    console.log(`The claimInfo: ${JSON.stringify(claimInfo)}`);

    /**
     * Now that its confirmed and not executed, we can execute our message in its outbox entry.
     */
    const l1ClaimTx = await scrollSDK.claimL2Tx(claimInfo, l1Wallet);
    console.log(`The l1 claim tx hash: ${l1ClaimTx.hash}`);
    await l1ClaimTx.wait();
    console.log('Done! Your transaction is executed');
  });

task('l2ClaimFromBlock', 'Calculate the l2 from block number')
  .addParam('txHash', 'The l1 tx hash', undefined, types.string, false)
  .setAction(async taskArgs => {
    const l1TxHash = taskArgs.txHash;
    console.log(`The l1 tx hash: ${l1TxHash}`);

    const l1Provider = new JsonRpcProvider(process.env.L1RPC);
    const l2Provider = new JsonRpcProvider(process.env.L2RPC);

    const l1TxReceipt = await l1Provider.getTransactionReceipt(l1TxHash);
    const l1Block = await l1Provider.getBlock(l1TxReceipt.blockNumber);
    const l1TxBlockTime = l1Block.timestamp;
    console.log(`The l1 tx send time: ${l1TxBlockTime}`);
    const currentL2BlockNumber = await l2Provider.getBlockNumber();
    const currentL2Block = await l2Provider.getBlock(currentL2BlockNumber);
    const currentL2BlockTime = currentL2Block.timestamp;
    console.log(`The l2 current block number: ${currentL2BlockNumber}, block time: ${currentL2BlockTime}`);
    const elapseTimeInSeconds = currentL2BlockTime - l1TxBlockTime;
    const elapseBlocks = Math.ceil(elapseTimeInSeconds / 3);
    const minFromL2BlockNumber = currentL2BlockNumber - elapseBlocks;
    console.log(`The l2 min from block number: ${minFromL2BlockNumber}`);
    const minFromL2Block = await l2Provider.getBlock(minFromL2BlockNumber);
    const minFromL2BlockTime = minFromL2Block.timestamp;
    let midBlockNumber = minFromL2BlockNumber;
    let midBlockTime = minFromL2BlockTime;
    console.log(`The mid from block number: ${midBlockNumber}, block time: ${midBlockTime}`);
    let midBlockNumberPlusOne = midBlockNumber + 1;
    let midBlockPlusOne = await l2Provider.getBlock(midBlockNumberPlusOne);
    let midBlockTimePlusOne = midBlockPlusOne.timestamp;
    console.log(`The midPlusOne from block number: ${midBlockNumberPlusOne}, block time: ${midBlockTimePlusOne}`);
    let highBlockNumber = currentL2BlockNumber;
    let lowBlockNumber = minFromL2BlockNumber;
    console.log(`Search range: [${highBlockNumber} - ${lowBlockNumber}]`);
    while (!(midBlockTime <= l1TxBlockTime && midBlockTimePlusOne > l1TxBlockTime)) {
      midBlockNumber = Math.ceil((highBlockNumber + lowBlockNumber) / 2);
      console.log(`The mid from block number: ${midBlockNumber}`);
      midBlockTime = (await l2Provider.getBlock(midBlockNumber)).timestamp;
      console.log(`The mid from block time: ${midBlockTime}`);
      midBlockNumberPlusOne = midBlockNumber + 1;
      midBlockPlusOne = await l2Provider.getBlock(midBlockNumberPlusOne);
      midBlockTimePlusOne = midBlockPlusOne.timestamp;
      console.log(`The midPlusOne from block number: ${midBlockNumberPlusOne}, block time: ${midBlockTimePlusOne}`);
      if (midBlockTime > l1TxBlockTime) {
        highBlockNumber = midBlockNumber;
      } else {
        lowBlockNumber = midBlockNumber;
      }
      console.log(`Search range: [${highBlockNumber} - ${lowBlockNumber}]`);
    }
    console.log(`The l2 from block number: ${midBlockNumber}`);
  });
