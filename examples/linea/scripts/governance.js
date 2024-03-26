const { JsonRpcProvider, formatEther } = require('ethers');
const { LineaSDK, OnChainMessageStatus } = require('@consensys/linea-sdk');
const { readDeployContract } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { task, types } = require('hardhat/config');
const { zkLinkConfig } = require('../../../script/zklink_config');

require('dotenv').config();

task('encodeL1ToL2Calldata', 'Encode call data for l1 to l2')
  .addParam('to', 'The l2 target address', undefined, types.string)
  .addParam('l2CallData', 'The l2 call data to target address', undefined, types.string)
  .addParam('l2CallValue', 'The l2 call value to target address', undefined, types.int)
  .setAction(async (taskArgs, hre) => {
    const l2ToContractAddress = taskArgs.to;
    const l2CallData = taskArgs.l2CallData;
    const l2CallValue = BigInt(taskArgs.l2CallValue);
    console.log(`The l2 target contract address: ${l2ToContractAddress}`);
    console.log(`The l2 call data to target address: ${l2CallData}`);
    console.log(`The l2 call value to target address: ${l2CallValue}`);

    const l2Provider = new JsonRpcProvider(process.env.L2RPC);
    const lineaName = process.env.LINEA;

    const l2ChainInfo = zkLinkConfig[lineaName];
    if (l2ChainInfo === undefined) {
      console.log('The l2 chain info not exist');
      return;
    }
    const messageServiceAddr = l2ChainInfo['l1Gateway']['constructParams'][0];
    if (messageServiceAddr === undefined) {
      console.log('The arbitrum inbox address not exist');
      return;
    }
    console.log(`The linea l1 message service address: ${messageServiceAddr}`);

    const lineaL2GovernanceAddr = readDeployContract(
      logName.DEPLOY_LINEA_L2_GOVERNANCE_LOG_PREFIX,
      logName.DEPLOY_LOG_GOVERNANCE,
      lineaName,
    );
    if (lineaL2GovernanceAddr === undefined) {
      console.log('linea l2 governance address not exist');
      return;
    }
    console.log(`The linea l2 governance address: ${lineaL2GovernanceAddr}`);
    if (l2CallValue > 0) {
      const l2GovernanceBalance = await l2Provider.getBalance(lineaL2GovernanceAddr);
      console.log(`The linea l2 governance balance: ${formatEther(l2GovernanceBalance)} ETH`);
      if (l2GovernanceBalance < l2CallValue) {
        console.log(`Please transfer some eth to linea l2 governance`);
        return;
      }
    }

    const call = {
      target: l2ToContractAddress,
      value: l2CallValue,
      data: l2CallData,
    };
    const lineaL2Governance = await hre.ethers.getContractAt(
      'LineaL2Governance',
      '0x0000000000000000000000000000000000000000',
    );
    const lineaL2GovernanceCallData = lineaL2Governance.interface.encodeFunctionData('execute', [[call]]);
    const lineaMessageService = await hre.ethers.getContractAt(
      'IMessageService',
      '0x0000000000000000000000000000000000000000',
    );
    const l1ToL2Calldata = lineaMessageService.interface.encodeFunctionData('sendMessage', [
      lineaL2GovernanceAddr,
      0,
      lineaL2GovernanceCallData,
    ]);
    console.log(`The l1 to l2 call target: ${messageServiceAddr}`);
    console.log(`The l1 to l2 call data: ${l1ToL2Calldata}`);
    console.log(`The l1 to l2 call value: 0`);
  });

task('checkL1TxStatus', 'Check the l1 tx status')
  .addParam('l1TxHash', 'The l1 tx hash', undefined, types.string)
  .setAction(async taskArgs => {
    const l1TxHash = taskArgs.l1TxHash;
    console.log(`The l1 tx hash: ${l1TxHash}`);

    const walletPrivateKey = process.env.DEVNET_PRIVKEY;
    const ethereumName = process.env.ETHEREUM;
    const sdk = new LineaSDK({
      l1RpcUrl: process.env.L1RPC ?? '',
      l2RpcUrl: process.env.L2RPC ?? '',
      l1SignerPrivateKey: walletPrivateKey ?? '',
      l2SignerPrivateKey: walletPrivateKey ?? '',
      network: ethereumName === 'GOERLI' ? 'linea-goerli' : ethereumName === 'SEPOLIA' ? 'localhost' : 'linea-mainnet',
      mode: 'read-write',
    });
    const sepoliaContracts = {
      l1ContractAddress: '0xB218f8A4Bc926cF1cA7b3423c154a0D627Bdb7E5',
      l2ContractAddress: '0x971e727e956690b9957be6d51Ec16E73AcAC83A7',
    };
    const lineaL1Contract = sdk.getL1Contract(sepoliaContracts.l1ContractAddress);
    const lineaL2Contract = sdk.getL2Contract(sepoliaContracts.l2ContractAddress);

    /**
     * Query the transaction status on L2 via messageHash.
     */
    const message = (await lineaL1Contract.getMessagesByTransactionHash(l1TxHash)).pop();

    // Waiting for the official Linea bridge to forward the message to L2
    // And manually claim the message on L2
    /*eslint no-constant-condition: ["error", { "checkLoops": false }]*/
    while (true) {
      const messageStatus = await lineaL2Contract.getMessageStatus(message.messageHash);
      console.log(`The message status: ${messageStatus}`);
      if (messageStatus === OnChainMessageStatus.CLAIMABLE) {
        const tx = await lineaL2Contract.claim(message);
        console.log(`The tx hash: ${tx.hash}`);
        await tx.wait();
        console.log(`The tx confirmed`);
        break;
      }
      await sleep(60 * 1000);
    }
    console.log('Done');
  });

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
