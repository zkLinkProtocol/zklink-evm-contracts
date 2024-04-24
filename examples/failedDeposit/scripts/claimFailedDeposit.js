const { Provider, Wallet, utils } = require('zksync-ethers');
const { task, types } = require('hardhat/config');
const { ethers } = require('ethers');
const { BigNumber } = require('@ethersproject/bignumber');
const { undoL1ToL2Alias } = require('zksync-ethers/build/utils');
const { suggestFees } = require('@rainbow-me/fee-suggestions');

require('dotenv').config();

const GETTER_ABI = [
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'canonicalTxHash',
        type: 'bytes32',
      },
    ],
    name: 'getSecondaryChainOp',
    outputs: [
      {
        components: [
          {
            internalType: 'address',
            name: 'gateway',
            type: 'address',
          },
          {
            internalType: 'uint256',
            name: 'priorityOpId',
            type: 'uint256',
          },
          {
            internalType: 'bytes32',
            name: 'canonicalTxHash',
            type: 'bytes32',
          },
        ],
        internalType: 'struct SecondaryChainOp',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];

task('claimFailedDeposit', 'Claim failed deposit from L1 to L2.')
  .addParam('l1rpc', 'RPC of the chain in which the deposit', undefined, types.string, false)
  .addParam('novaHash', 'Executing deposit on Nova failed transaction hash', undefined, types.string, false)
  .addParam('isZksync', 'Whether the deposit is in zksync', false, types.boolean, true)
  .setAction(async (taskArgs, hre) => {
    const l1rpc = taskArgs.l1rpc;
    const novaHash = taskArgs.novaHash;
    const isZksync = taskArgs.isZksync;
    console.log(`The l1rpc is ${l1rpc}`);
    console.log(`The nova tx hash is ${novaHash}`);
    console.log(`The isZksync is ${isZksync}`);

    let l1Provider, l1Wallet;
    if (isZksync) {
      l1Provider = new Provider(l1rpc);
      l1Wallet = new Wallet(process.env.PRIVATE_KEY, l1Provider);
    } else {
      l1Provider = new ethers.JsonRpcProvider(l1rpc);
      l1Wallet = new ethers.Wallet(process.env.PRIVATE_KEY, l1Provider);
    }
    const l2Provider = new Provider(process.env.L2RPC);
    const novaTxReceipt = await l2Provider.getTransactionReceipt(ethers.hexlify(novaHash));
    const l1BatchNumber = novaTxReceipt.l1BatchNumber;
    const l1BatchTxIndex = novaTxReceipt.l1BatchTxIndex;
    if (!l1BatchNumber && !l1BatchTxIndex) {
      console.log('The l1 batch number or l1 batch tx index is empty');
      return;
    }
    console.log(`The l1 batch number: ${l1BatchNumber}, The l1 batch tx index: ${l1BatchTxIndex}`);
    const successL2ToL1LogIndex = novaTxReceipt.l2ToL1Logs.findIndex(
      l2ToL1log => l2ToL1log.sender == utils.BOOTLOADER_FORMAL_ADDRESS && l2ToL1log.key == novaHash,
    );
    console.log('Success L2 to L1 Log Index :>> ', successL2ToL1LogIndex);

    const novaTx = await l2Provider.getTransaction(ethers.hexlify(novaHash));

    const l1ERC20BridgeAddr = undoL1ToL2Alias(novaTxReceipt.from);
    console.log(`The l1 erc20 bridge address is ${l1ERC20BridgeAddr}`);
    const l2ERC20BridgeAddr = novaTxReceipt.to;
    console.log(`The l2 erc20 bridge address is ${l2ERC20BridgeAddr}`);

    const l1Bridge = await hre.ethers.getContractAt('L1ERC20Bridge', l1ERC20BridgeAddr, l1Wallet);
    const l2Bridge = await hre.ethers.getContractAt('IL2Bridge', l2ERC20BridgeAddr, l2Provider);
    const funcSign = l2Bridge.interface.parseTransaction({ data: novaTx.data });
    console.log(`The function signature is ${funcSign.signature}`);
    const inputData = l2Bridge.interface.decodeFunctionData(funcSign.signature, novaTx.data);
    console.log(`The calldata is ${inputData}`);
    const l1Sender = inputData['_l1Sender'];
    console.log(`The l1 sender is ${l1Sender}`);
    const l1Token = inputData['_l1Token'];
    console.log(`The l1 token is ${l1Token}`);

    const proof = await l2Provider.getLogProof(novaHash, successL2ToL1LogIndex);
    if (!proof) {
      console.log('The proof is empty');
      return;
    }

    const lineaProvider = new ethers.JsonRpcProvider(process.env.LINEA_RPC);
    const getterContract = await hre.ethers.getContractAt(GETTER_ABI, process.env.PRIMARY_CHAIN_ZKLINK, lineaProvider);
    const secondaryChainOp = await getterContract.getSecondaryChainOp(ethers.hexlify(novaHash));
    const canonicalTxHash = secondaryChainOp['canonicalTxHash'];
    console.log('The canonicalTxHash is :>> ', canonicalTxHash);

    const claimCalldata = l1Bridge.interface.encodeFunctionData('claimFailedDeposit', [
      l1Sender,
      l1Token,
      canonicalTxHash,
      l1BatchNumber,
      proof.id,
      l1BatchTxIndex,
      proof.proof,
    ]);
    const estimateGasLimit = await l1Provider.estimateGas({
      from: l1Wallet.address,
      to: l1ERC20BridgeAddr,
      data: claimCalldata,
    });
    const adjustedGasLimit = BigNumber.from(estimateGasLimit).mul(120).div(100);
    console.log(`The adjusted gas limit is ${adjustedGasLimit}`);

    const fees = await suggestFees(l1Provider);
    const baseFee = BigNumber.from(fees.baseFeeSuggestion);
    const maxPriorityFeePerGas = BigNumber.from(fees.maxPriorityFeeSuggestions.fast);
    const maxFeePerGas = maxPriorityFeePerGas.add(baseFee.mul(BigNumber.from(2)));

    const claimTx = await l1Bridge.claimFailedDeposit(
      l1Sender,
      l1Token,
      canonicalTxHash,
      l1BatchNumber,
      proof.id,
      l1BatchTxIndex,
      proof.proof,
      {
        gasLimit: adjustedGasLimit.toString(),
        maxFeePerGas: maxFeePerGas.toString(),
        maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
      },
    );
    console.log(`The claim tx hash is ${claimTx.hash}`);
    await claimTx.wait();
    console.log('Claim failed deposit successfully');
  });
