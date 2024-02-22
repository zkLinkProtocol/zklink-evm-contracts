const { JsonRpcProvider, Wallet, formatEther } = require('ethers');
const { readDeployContract } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { task } = require('hardhat/config');

require('dotenv').config();

task('changeFeeParams', 'Change fee params for zkLink').setAction(async (taskArgs, hre) => {
  const walletPrivateKey = process.env.DEVNET_PRIVKEY;
  const l1Provider = new JsonRpcProvider(process.env.L1RPC);
  const ethereumName = process.env.ETHEREUM;
  const l1Wallet = new Wallet(walletPrivateKey, l1Provider);

  const l1WalletAddress = await l1Wallet.getAddress();
  const l1WalletBalance = formatEther(await l1Provider.getBalance(l1WalletAddress));
  console.log(`${l1WalletAddress} balance on l1: ${l1WalletBalance} ether`);

  const arbitratorAddr = readDeployContract(
    logName.DEPLOY_ARBITRATOR_LOG_PREFIX,
    logName.DEPLOY_LOG_ARBITRATOR,
    ethereumName,
  );
  if (arbitratorAddr === undefined) {
    console.log('The arbitrator address not exist');
    return;
  }
  console.log(`The arbitrator address: ${arbitratorAddr}`);

  const ethereumGatewayAddr = readDeployContract(
    logName.DEPLOY_ETH_GATEWAY_LOG_PREFIX,
    logName.DEPLOY_GATEWAY,
    ethereumName,
  );
  if (ethereumGatewayAddr === undefined) {
    console.log('ethereum gateway address not exist');
    return;
  }
  console.log(`The ethereum gateway address: ${ethereumGatewayAddr}`);

  // forward message to gateway
  const arbitrator = await hre.ethers.getContractAt('Arbitrator', arbitratorAddr, l1Wallet);
  const { INIT_FEE_PARAMS } = require('../../../script/zksync_era');
  let tx = await arbitrator.changeFeeParams(ethereumGatewayAddr, INIT_FEE_PARAMS, '0x');
  console.log(`The tx hash: ${tx.hash} , waiting confirm...`);
  await tx.wait();
  console.log(`The tx confirmed`);
});
