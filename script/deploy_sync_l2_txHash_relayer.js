const fs = require('fs');
const {
  verifyContractCode,
  createOrGetDeployLog,
  ChainContractDeployer,
  getDeployTx,
  readDeployLogField,
} = require('./utils');
const logName = require('./deploy_log_name');
const { task, types } = require('hardhat/config');

function getRelayerContractName() {
  return 'SyncL2TxHashRelayer';
}

task('deploySyncL2TxHashRelayer', 'Deploy SyncL2TxHashRelayer')
  .addParam('messageService', 'The primary chain message service', undefined, types.string, false)
  .addParam(
    'arbitrator',
    'The arbitrator address (default get from arbitrator deploy log)',
    undefined,
    types.string,
    true,
  )
  .addParam('skipVerify', 'Skip verify', false, types.boolean, true)
  .setAction(async (taskArgs, hardhat) => {
    let arbitrator = taskArgs.arbitrator;
    if (arbitrator === undefined) {
      arbitrator = readDeployLogField(logName.DEPLOY_ARBITRATOR_LOG_PREFIX, logName.DEPLOY_LOG_ARBITRATOR);
    }
    let messageService = taskArgs.messageService;
    let skipVerify = taskArgs.skipVerify;
    console.log('arbitrator', arbitrator);
    console.log('message service', messageService);
    console.log('skip verify contracts?', skipVerify);

    const contractDeployer = new ChainContractDeployer(hardhat);
    await contractDeployer.init();
    const deployerWallet = contractDeployer.deployerWallet;

    const { deployLogPath, deployLog } = createOrGetDeployLog(logName.DEPLOY_SYNCL2TXHASHRELAYER_LOG_PREFIX);
    deployLog[logName.DEPLOY_LOG_DEPLOYER] = deployerWallet.address;
    fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));

    // deploy syncL2TxHashRelayer
    let syncL2TxHashRelayerAddr;
    if (!(logName.DEPLOY_LOG_SYNCL2TXHASHRELAYER in deployLog)) {
      console.log('deploy syncL2TxHashRelayer...');
      const contractName = getRelayerContractName();
      const contract = await contractDeployer.deployContract(contractName, [messageService, arbitrator]);
      const transaction = await getDeployTx(contract);
      syncL2TxHashRelayerAddr = await contract.getAddress();
      deployLog[logName.DEPLOY_LOG_SYNCL2TXHASHRELAYER] = syncL2TxHashRelayerAddr;
      deployLog[logName.DEPLOY_LOG_DEPLOY_TX_HASH] = transaction.hash;
      deployLog[logName.DEPLOY_LOG_DEPLOY_BLOCK_NUMBER] = transaction.blockNumber;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    } else {
      syncL2TxHashRelayerAddr = deployLog[logName.DEPLOY_LOG_SYNCL2TXHASHRELAYER];
    }
    console.log('syncL2TxHashRelayer', syncL2TxHashRelayerAddr);

    // verify target contract
    if (!(logName.DEPLOY_LOG_SYNCL2TXHASHRELAYER_VERIFIED in deployLog) && !skipVerify) {
      await verifyContractCode(hardhat, syncL2TxHashRelayerAddr, [messageService, arbitrator]);
      deployLog[logName.DEPLOY_LOG_SYNCL2TXHASHRELAYER_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }
  });
