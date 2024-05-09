const { Provider } = require('zksync-ethers');
const { ethers } = require('ethers');
const { LineaSDK } = require('@consensys/linea-sdk');
const { LineaRollup__factory } = require('@consensys/linea-sdk/dist/typechain');
const { task, types } = require('hardhat/config');

require('dotenv').config();

task('getTxStatus', 'Get the tx status of nova')
  .addParam('txHash', 'The tx hash', undefined, types.string)
  .setAction(async taskArgs => {
    const txHash = taskArgs.txHash;
    console.log(`Get the status of tx: ${txHash}`);
    const zkLinkNovaProvider = new Provider(process.env.ZKLINK_NOVA_RPC);
    const lineaProvider = new ethers.JsonRpcProvider(process.env.LINEA_RPC);
    const ethereumProvider = new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC);

    const txReceipt = await zkLinkNovaProvider.getTransactionReceipt(txHash);
    if (!txReceipt.blockNumber) {
      console.log(`Tx status: not confirmed`);
      return;
    }
    console.log(`Tx block: ${txReceipt.blockNumber}`);

    const blockDetails = await zkLinkNovaProvider.getBlockDetails(txReceipt.blockNumber);
    if (!blockDetails.commitTxHash) {
      console.log(`Tx status: not committed`);
      return;
    }
    console.log(`Block commit tx hash: ${blockDetails.commitTxHash}`);

    const blockCommitTxReceipt = await lineaProvider.getTransactionReceipt(blockDetails.commitTxHash);
    if (!blockCommitTxReceipt.blockNumber) {
      console.log(`Tx status: commit tx not confirmed`);
      return;
    }
    console.log(`Commit tx block number on linea: ${blockCommitTxReceipt.blockNumber}`);

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
    if (currentFinalizeBlockNumber >= blockCommitTxReceipt.blockNumber) {
      console.log(`Tx status: finalized`);
    } else {
      console.log(`Tx status: not finalized`);
    }
  });
