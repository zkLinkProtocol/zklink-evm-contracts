const { Provider, Wallet, utils } = require('zksync-ethers');
const { task, types } = require('hardhat/config');
const { ethers } = require('ethers');

require('dotenv').config();

task('depositERC20', 'Deposit eth from secondary chain')
  .addParam('token', 'The token address', undefined, types.string, false)
  .addOptionalParam('decimals', 'The token decimals', 18, types.int)
  .addParam('amount', 'Deposit token amount(unit: ether)', undefined, types.string, false)
  .setAction(async (taskArgs, hre) => {
    const l1TokenAddress = taskArgs.token;
    const tokenDecimals = taskArgs.decimals;
    console.log(`Token address is ${l1TokenAddress}`);
    console.log(`Token decimals is ${tokenDecimals}`);
    console.log(`Deposit amount is ${taskArgs.amount}`);
    const tokenAmount = ethers.parseUnits(taskArgs.amount, tokenDecimals);
    const l1Provider = new Provider(process.env.L1RPC);
    const l2Provider = new Provider(process.env.L2RPC);
    const wallet = new Wallet(process.env.DEVNET_PRIVKEY, l2Provider, l1Provider);
    console.log(`Wallet address is ${wallet.address}`);
    const l1Token = await hre.ethers.getContractAt('IERC20', l1TokenAddress, wallet.ethWallet());
    const l1TokenBalance = await l1Token.balanceOf(wallet.address);
    console.log(`Token L1 Balance is ${ethers.formatUnits(l1TokenBalance, tokenDecimals)}`);
    const l1ERC20BridgeAddress = process.env.L1_ERC20_BRIDGE_ADDRESS;
    const l1ERC20Bridge = await hre.ethers.getContractAt('L1ERC20Bridge', l1ERC20BridgeAddress, wallet.ethWallet());
    const l2TokenAddress = await l1ERC20Bridge.l2TokenAddress(l1TokenAddress);
    console.log(`L2 token address is ${l2TokenAddress}`);
    const l2Token = await hre.ethers.getContractAt('IERC20', l2TokenAddress, wallet);
    const l2TokeCode = await l2Provider.getCode(l2TokenAddress);
    let l2TokenBalance = 0n;
    if (l2TokeCode !== '0x') {
      l2TokenBalance = await l2Token.balanceOf(wallet.address);
    }
    console.log(`Token L2 Balance is ${ethers.formatUnits(l2TokenBalance, tokenDecimals)}`);

    // Estimate the gas
    const l2ERC20BridgeAddress = await l1ERC20Bridge.l2Bridge();
    const customBridgeData = await utils.getERC20DefaultBridgeData(l1TokenAddress, l1Provider);
    const l2GasLimit = await utils.estimateCustomBridgeDepositL2Gas(
      l2Provider,
      l1ERC20BridgeAddress,
      l2ERC20BridgeAddress,
      l1TokenAddress,
      tokenAmount,
      wallet.address,
      customBridgeData,
      wallet.address,
    );
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
    const msgValue = baseCost;

    // Approve token
    const allowance = await l1Token.allowance(wallet.address, l1ERC20BridgeAddress);
    if (allowance < tokenAmount) {
      console.log(`Approve to l1 erc20 bridge...`);
      await l1Token.approve(l1ERC20BridgeAddress, ethers.MaxUint256);
    }

    // Deposit eth
    console.log(`Send a l1 message to l2...`);
    const tx = await l1ERC20Bridge.deposit(
      wallet.address,
      l1TokenAddress,
      tokenAmount,
      l2GasLimit,
      l2GasPerPubdataByteLimit,
      wallet.address,
      { value: msgValue },
    );
    console.log(`The tx hash: ${tx.hash} , waiting for confirm...`);
    await tx.wait();
    console.log(`The tx confirmed`);
  });
