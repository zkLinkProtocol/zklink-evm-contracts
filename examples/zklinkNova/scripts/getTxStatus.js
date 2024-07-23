const { Provider } = require('zksync-ethers');
const { ethers } = require('ethers');
const { LineaSDK } = require('@consensys/linea-sdk');
const { LineaRollup__factory } = require('@consensys/linea-sdk/dist/typechain');
const { task, types } = require('hardhat/config');

require('dotenv').config();

// This command is used to check if a tx of zklink nova is considered to be finalized on Ethereum
// A tx of zklink nova is considered to be finalized on Ethereum means:
// 1. The tx is confirmed on zklink nova
// 2. The block of zklink nova which contain the tx is considered to be finalized on Linea
// 3. The block of Linea which contain the finalize tx of nova is considered to be finalized on Ethereum
task('getTxStatus', 'Get the tx status of nova')
  .addParam('txHash', 'The tx hash', undefined, types.string)
  .addOptionalParam('useCommit', 'Use commit as the nova finalize tx', true, types.boolean)
  .setAction(async taskArgs => {
    // This is a tx hash of zklink nova
    const txHash = taskArgs.txHash;
    // A block of zklink nova must first be committed to Linea, then proven, and finally executed.
    // Generally, a block can be committed to Linea in about 10 minutes after it is generated, but proof takes longer, which may take about an hour.
    // If `useCommit` set to true, then the finalize time of a nova tx to Linea is about 10 minutes
    // Otherwise it may take more than 1 hour
    const useCommit = taskArgs.useCommit;
    console.log(`Get the status of tx: ${txHash}`);
    const zkLinkNovaProvider = new Provider(process.env.ZKLINK_NOVA_RPC);
    const lineaProvider = new ethers.JsonRpcProvider(process.env.LINEA_RPC);
    const ethereumProvider = new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC);

    // We check if the tx is confirmed on zklink nova
    const txReceipt = await zkLinkNovaProvider.getTransactionReceipt(txHash);
    if (!txReceipt.blockNumber) {
      console.log(`Tx status: not confirmed`);
      return;
    }
    console.log(`Tx block: ${txReceipt.blockNumber}`);

    // Then we check the finalize status on Linea of the block which contain the tx
    // If `useCommit` is true then the finalize time of the block will be about 10 minutes
    const blockDetails = await zkLinkNovaProvider.getBlockDetails(txReceipt.blockNumber);
    const novaFinalizeTx = useCommit ? blockDetails.commitTxHash : blockDetails.proveTxHash;
    if (!novaFinalizeTx) {
      console.log(`Tx status: not finalized on linea`);
      return;
    }
    console.log(`Nova finalize tx hash: ${novaFinalizeTx}`);

    const novaFinalizeTxReceipt = await lineaProvider.getTransactionReceipt(novaFinalizeTx);
    if (!novaFinalizeTxReceipt.blockNumber) {
      console.log(`Tx status: nova finalize tx not confirmed`);
      return;
    }
    console.log(`Nova finalize tx block number on linea: ${novaFinalizeTxReceipt.blockNumber}`);

    // After the nova block finalize tx is confirmed on linea, we continue to check the status of Linea's tx finalized on Ethereum
    // Linea deployed a rollup contract on Ethereum and has a readable interface `function currentL2BlockNumber() external view`
    // When the number of a block on Linea is smaller or equal to the value of `currentL2BlockNumber` it means the block is finalized on Ethereum
    const ethereumChainId = (await ethereumProvider.getNetwork()).chainId;
    const network = ethereumChainId === BigInt(1) ? 'linea-mainnet' : 'linea-sepolia';
    const lineaSDK = new LineaSDK({
      l1RpcUrl: process.env.ETHEREUM_RPC ?? '',
      l2RpcUrl: process.env.LINEA_RPC ?? '',
      network,
      mode: 'read-only',
    });
    const lineaL1Contract = lineaSDK.getL1Contract();

    const lineaRollup = LineaRollup__factory.connect(lineaL1Contract.contractAddress, ethereumProvider);
    const currentFinalizeBlockNumber = await lineaRollup.currentL2BlockNumber();
    console.log(`Linea current finalize block number: ${currentFinalizeBlockNumber}`);
    if (currentFinalizeBlockNumber >= novaFinalizeTxReceipt.blockNumber) {
      console.log(`Tx status: finalized on ethereum`);
    } else {
      console.log(`Tx status: not finalized on ethereum`);
    }
  });
