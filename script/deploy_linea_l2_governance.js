const fs = require('fs');
const {
  verifyContractCode,
  getDeployTx,
  createOrGetDeployLog,
  readDeployContract,
  ChainContractDeployer,
} = require('./utils');
const logName = require('./deploy_log_name');
const { zkLinkConfig } = require('./zklink_config');
const { task, types } = require('hardhat/config');

task('deployLineaL2Governance', 'Deploy linea l2 governance')
  .addParam('skipVerify', 'Skip verify', false, types.boolean, true)
  .setAction(async (taskArgs, hardhat) => {
    let skipVerify = taskArgs.skipVerify;
    console.log('skip verify contracts?', skipVerify);

    const netName = process.env.NET;
    if (!netName || !netName.startsWith('LINEA')) {
      console.log('LineaL2Governance only can be deployed on linea');
      return;
    }
    const chainInfo = zkLinkConfig[netName];
    if (chainInfo === undefined) {
      console.log('current net not support');
      return;
    }
    const l2GatewayInfo = chainInfo.l2Gateway;
    if (l2GatewayInfo === undefined) {
      console.log('l2 gateway config not exist');
      return;
    }
    const messageServiceAddr = l2GatewayInfo['constructParams'][0];
    console.log('l2 message service address', messageServiceAddr);
    const l1GatewayInfo = chainInfo.l1Gateway;
    if (l1GatewayInfo === undefined) {
      console.log('l1 gateway config not exist');
      return;
    }
    const l1NetName = l1GatewayInfo.netName;
    const l1GovernanceAddr = readDeployContract(
      logName.DEPLOY_GOVERNANCE_LOG_PREFIX,
      logName.DEPLOY_LOG_GOVERNANCE,
      l1NetName,
    );
    if (l1GovernanceAddr === undefined) {
      console.log('l1 governance not exist');
      return;
    }
    console.log('l1 governance', l1GovernanceAddr);

    const { deployLogPath, deployLog } = createOrGetDeployLog(logName.DEPLOY_LINEA_L2_GOVERNANCE_LOG_PREFIX);
    const contractDeployer = new ChainContractDeployer(hardhat);
    await contractDeployer.init();

    // deploy governance
    let governanceAddr;
    const allConstructParams = [messageServiceAddr, l1GovernanceAddr];
    if (!(logName.DEPLOY_LOG_GOVERNANCE in deployLog)) {
      console.log('deploy governance...');
      const contract = await contractDeployer.deployContract('LineaL2Governance', allConstructParams);
      const transaction = await getDeployTx(contract);
      governanceAddr = await contract.getAddress();
      deployLog[logName.DEPLOY_LOG_GOVERNANCE] = governanceAddr;
      deployLog[logName.DEPLOY_LOG_DEPLOY_TX_HASH] = transaction.hash;
      deployLog[logName.DEPLOY_LOG_DEPLOY_BLOCK_NUMBER] = transaction.blockNumber;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    } else {
      governanceAddr = deployLog[logName.DEPLOY_LOG_GOVERNANCE];
    }
    console.log('linea l2 governance', governanceAddr);

    // verify governance
    if (!(logName.DEPLOY_LOG_GOVERNANCE_VERIFIED in deployLog) && !skipVerify) {
      await verifyContractCode(hardhat, governanceAddr, allConstructParams);
      deployLog[logName.DEPLOY_LOG_GOVERNANCE_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }
  });
