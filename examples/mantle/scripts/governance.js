const mantle = require('@mantleio/sdk');
const { DepositTx, applyL1ToL2Alias } = require('@mantleio/core-utils');
const { readDeployContract } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { task, types } = require('hardhat/config');
const { zkLinkConfig } = require('../../../script/zklink_config');
const ethers = require('ethers');
const { L1_TESTNET_CONTRACTS, L1_MAINNET_CONTRACTS } = require('./constants');
const { BigNumber, Contract } = require('ethers');

require('dotenv').config();

async function initMessenger() {
  const walletPrivateKey = process.env.DEVNET_PRIVKEY;
  const l1Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L1RPC);
  const l2Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L2RPC);
  const ethereumName = process.env.ETHEREUM;
  const mantleName = process.env.MANTLE;
  const l1Wallet = new ethers.Wallet(walletPrivateKey, l1Provider);
  const l2Wallet = new ethers.Wallet(walletPrivateKey, l2Provider);
  // https://docs-v2.mantle.xyz/intro/system-components/on-chain-system
  const messengerL1Contracts = ethereumName !== 'ETHEREUM' ? L1_TESTNET_CONTRACTS : L1_MAINNET_CONTRACTS;
  const messenger = new mantle.CrossChainMessenger({
    l1ChainId: await l1Wallet.getChainId(),
    l2ChainId: await l2Wallet.getChainId(),
    l1SignerOrProvider: l1Wallet,
    l2SignerOrProvider: l2Wallet,
    bedrock: true,
    contracts: {
      l1: messengerL1Contracts,
    },
  });

  return { messenger, ethereumName, mantleName };
}

task('encodeL1ToL2Calldata', 'Encode call data for l1 to l2')
  .addParam('to', 'The l2 target address', undefined, types.string)
  .addParam('l2CallData', 'The l2 call data to target address', undefined, types.string)
  .addParam('l2CallValue', 'The l2 call value to target address', undefined, types.int)
  .setAction(async taskArgs => {
    const l2ToContractAddress = taskArgs.to;
    const l2CallData = taskArgs.l2CallData;
    const l2CallValue = taskArgs.l2CallValue;
    console.log(`The l2 target contract address: ${l2ToContractAddress}`);
    console.log(`The l2 call data to target address: ${l2CallData}`);
    console.log(`The l2 call value to target address: ${l2CallValue}`);

    const { messenger, ethereumName, mantleName: opChainName } = await initMessenger();

    const l2ChainInfo = zkLinkConfig[opChainName];
    if (l2ChainInfo === undefined) {
      console.log('The l2 chain info not exist');
      return;
    }
    const portalContract = messenger.contracts.l1.OptimismPortal;
    console.log(`The optimism portal address: ${portalContract.address}`);

    const l1GovernanceAddr = readDeployContract(
      logName.DEPLOY_GOVERNANCE_LOG_PREFIX,
      logName.DEPLOY_LOG_GOVERNANCE,
      ethereumName,
    );
    if (l1GovernanceAddr === undefined) {
      console.log('governance address not exist');
      return;
    }
    console.log(`The l1 governance address: ${l1GovernanceAddr}`);
    const l2GovernanceAddr = applyL1ToL2Alias(l1GovernanceAddr);
    console.log(`The l2 governance address: ${l2GovernanceAddr}`);

    const l2Provider = messenger.l2Provider;
    const l2GovernanceBalance = await l2Provider.getBalance(l2GovernanceAddr);
    console.log(`The l2 governance balance: ${l2GovernanceBalance.toString()}`);
    if (l2GovernanceBalance.eq(BigNumber.from(0))) {
      console.log(`Estimate gas will failed with error: insufficient funds for transfer`);
      console.log(`Please transfer some mnt token to the l2 governance address for estimating gas`);
      return;
    }
    let l2GasLimit = await l2Provider.estimateGas({
      from: l2GovernanceAddr,
      to: l2ToContractAddress,
      data: l2CallData,
      value: l2CallValue,
    });
    const tokenRatioAbi =
      '[{\n' +
      '        "inputs": [],\n' +
      '        "name": "tokenRatio",\n' +
      '        "outputs": [\n' +
      '            {\n' +
      '                "internalType": "uint256",\n' +
      '                "name": "",\n' +
      '                "type": "uint256"\n' +
      '            }\n' +
      '        ],\n' +
      '        "stateMutability": "view",\n' +
      '        "type": "function"\n' +
      '    }]';
    const tokenRatioInterface = new ethers.utils.Interface(tokenRatioAbi);
    const l2GasPriceOracle = new Contract(
      messenger.contracts.l2.BVM_GasPriceOracle.address,
      tokenRatioInterface,
      l2Provider,
    );
    const tokenRatio = await l2GasPriceOracle.tokenRatio();
    console.log(`The eth/mnt token ratio: ${tokenRatio}`);
    l2GasLimit = l2GasLimit.div(BigNumber.from(tokenRatio));
    console.log(`The l2 gas limit: ${l2GasLimit.toString()}`);
    l2GasLimit = l2GasLimit.mul(120).div(100); // Add 20% buffer
    console.log(`The l2 gas limit: ${l2GasLimit.toString()}`);

    const sendMessageCalldata = portalContract.interface.encodeFunctionData('depositTransaction', [
      l2CallValue,
      l2ToContractAddress,
      l2CallValue,
      l2GasLimit,
      false,
      l2CallData,
    ]);
    console.log(`The l1 to l2 call target: ${portalContract.address}`);
    console.log(`The l1 to l2 call data: ${sendMessageCalldata}`);
    console.log(`The l1 to l2 call value: ${l2CallValue}`);
  });

task('checkL1TxStatus', 'Check the l1 tx status')
  .addParam('l1TxHash', 'The l1 tx hash', undefined, types.string)
  .setAction(async taskArgs => {
    const l1TxHash = taskArgs.l1TxHash;
    console.log(`The l1 tx hash: ${l1TxHash}`);

    const { messenger } = await initMessenger();

    const l1Provider = messenger.l1Provider;
    const l2Provider = messenger.l2Provider;
    const l1TxReceipt = await l1Provider.getTransactionReceipt(l1TxHash);
    const eventFilter =
      'TransactionDeposited(address indexed from, address indexed to, uint256 indexed version, bytes opaqueData)';
    const event = (
      await messenger.contracts.l1.OptimismPortal.queryFilter(
        eventFilter,
        l1TxReceipt.blockNumber,
        l1TxReceipt.blockNumber,
      )
    ).pop();
    const deposit = DepositTx.fromL1Event(event);
    await l2Provider.waitForTransaction(deposit.hash());
    console.log(`L1 to l2 tx is executed 🥳`);
  });
