// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require('hardhat');
const { readDeployContract } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');

async function main() {
  const zkLinkAddr = readDeployContract(logName.DEPLOY_ZKLINK_LOG_PREFIX, logName.DEPLOY_LOG_ZKLINK_PROXY);
  if (zkLinkAddr === undefined) {
    console.log('zkLink address not exist');
    return;
  }
  console.log('zkLink', zkLinkAddr);

  const zkLink = await hre.ethers.getContractAt('ZkLink', zkLinkAddr);
  const existGatewayAddr = await zkLink.gateway();
  console.log('gateway addr', existGatewayAddr);

  const newTotalSyncedPriorityTxs = 100;
  const tx = await zkLink.syncL2Requests(newTotalSyncedPriorityTxs);
  await tx.wait();
  console.log('tx:', tx.hash);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
