const { Provider, Wallet, utils } = require('zksync-ethers');
const { task, types } = require('hardhat/config');
const { ethers } = require('ethers');

require('dotenv').config();

task('depositETH', 'Deposit eth from secondary chain')
  .addParam('amount', 'Deposit eth amount(unit: ether)', undefined, types.string, false)
  .setAction(async (taskArgs, hre) => {
    console.log(`Deposit ${taskArgs.amount} ether`);
    const l2Value = ethers.parseEther(taskArgs.amount);
    const l1Provider = new Provider(process.env.L1RPC);
    const l2Provider = new Provider(process.env.L2RPC);
    const wallet = new Wallet(process.env.DEVNET_PRIVKEY, l2Provider, l1Provider);

    const l1Balance = ethers.formatEther(await wallet.getBalanceL1());
    const l2Balance = ethers.formatEther(await wallet.getBalance());
    console.log(`Wallet address is ${wallet.address}`);
    console.log(`L1 Balance is ${l1Balance}`);
    console.log(`L2 Balance is ${l2Balance}`);

    // Estimate the gas
    const l2GasLimit = await l2Provider.estimateL1ToL2Execute({
      contractAddress: wallet.address,
      calldata: '0x',
      caller: wallet.address,
      l2Value: l2Value,
      factoryDeps: [],
    });
    // Log the estimated gas
    console.log(`Estimated gas for L1 to L2 operation: ${l2GasLimit.toString()}`);

    // Get primary tx gas price
    const zkLink = await hre.ethers.getContractAt('ZkLink', process.env.ZKLINK_ADDRESS, wallet.ethWallet());
    const primaryTxGasPrice = await zkLink.txGasPrice();
    console.log(`Primary tx gas price: ${ethers.formatUnits(primaryTxGasPrice, 'gwei')} gwei`);

    // Base cost
    const l2GasPerPubdataByteLimit = utils.REQUIRED_L1_TO_L2_GAS_PER_PUBDATA_LIMIT;
    const baseCost = await zkLink.l2TransactionBaseCost(primaryTxGasPrice, l2GasLimit, l2GasPerPubdataByteLimit);
    console.log(`Base cost is ${ethers.formatEther(baseCost)} ether`);
    const msgValue = baseCost + l2Value;

    // Deposit eth
    console.log(`Send a l1 message to l2...`);
    const tx = await zkLink.requestL2Transaction(
      wallet.address,
      l2Value,
      '0x',
      l2GasLimit,
      l2GasPerPubdataByteLimit,
      [],
      wallet.address,
      { value: msgValue },
    );
    console.log(`The tx hash: ${tx.hash} , waiting for confirm...`);
    await tx.wait();
    console.log(`The tx confirmed`);
  });
