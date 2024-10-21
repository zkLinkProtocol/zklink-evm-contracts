const fs = require('fs');
const { getImplementationAddress } = require('@openzeppelin/upgrades-core');
const { verifyContractCode, createOrGetDeployLog, ChainContractDeployer, getDeployTx } = require('./utils');
const logName = require('./deploy_log_name');
const { task, types } = require('hardhat/config');

task('deployFastSettlementOperator', 'Deploy fastSettlement operator')
  .addParam('force', 'Fore redeploy all contracts', false, types.boolean, true)
  .addParam('operatorregistry', 'the operatorRegistry address', undefined, types.string, false)
  .addParam('vaultoptinservice', 'the vaultOptInService address', undefined, types.string, false)
  .addParam('networkoptinservice', 'the networkOptInService address', undefined, types.string, false)
  .addParam('vaultfactory', 'the vaultFactory address', undefined, types.string, false)
  .addParam('networkregistry', 'the networkRegistry address', undefined, types.string, false)
  .addParam('fastsettlementmiddleware', 'the fastSettlementMiddleware address', undefined, types.string, false)
  .addParam('owner', 'the owner address', undefined, types.string, false)
  .addParam('fastsyncmessagesender', 'the fastSyncMessageSender address', undefined, types.string, false)
  .addParam('skipVerify', 'Skip verify', false, types.boolean, true)
  .setAction(async (taskArgs, hardhat) => {
    let force = taskArgs.force;
    let operatorRegistry = taskArgs.operatorregistry;
    let vaultOptInService = taskArgs.vaultoptinservice;
    let networkOptInService = taskArgs.networkoptinservice;
    let vaultFactory = taskArgs.vaultfactory;
    let networkRegistry = taskArgs.networkregistry;
    let fastSettlementMiddleware = taskArgs.fastsettlementmiddleware;
    let owner = taskArgs.owner;
    let fastSyncMessageSender = taskArgs.fastsyncmessagesender;
    let skipVerify = taskArgs.skipVerify;
    console.log('force redeploy all contracts?', force);
    console.log('skip verify contracts?', skipVerify);

    const contractDeployer = new ChainContractDeployer(hardhat);
    await contractDeployer.init();
    const deployerWallet = contractDeployer.deployerWallet;

    const { deployLogPath, deployLog } = createOrGetDeployLog(logName.DEPLOY_FASTSETTLEMENT_OPERATOR_LOG_PREFIX);
    deployLog[logName.DEPLOY_LOG_GOVERNOR] = deployerWallet.address;
    fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));

    let operatorAddr;
    if (!(logName.DEPLOY_LOG_FASTSETTLEMENT_OPERATOR in deployLog) || force) {
      console.log('deploy operator...');
      const contract = await contractDeployer.deployProxy(
        'FastSettlementOperator',
        [owner, fastSyncMessageSender],
        [
          operatorRegistry,
          vaultOptInService,
          networkOptInService,
          vaultFactory,
          networkRegistry,
          fastSettlementMiddleware,
        ],
      );
      const transaction = await getDeployTx(contract);
      operatorAddr = await contract.getAddress();
      deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_OPERATOR] = operatorAddr;
      deployLog[logName.DEPLOY_LOG_DEPLOY_TX_HASH] = transaction.hash;
      deployLog[logName.DEPLOY_LOG_DEPLOY_BLOCK_NUMBER] = transaction.blockNumber;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    } else {
      operatorAddr = deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_OPERATOR];
    }
    console.log('operator', operatorAddr);

    let operatorTargetAddr;
    if (!(logName.DEPLOY_LOG_FASTSETTLEMENT_OPERATOR_TARGET in deployLog) || force) {
      console.log('get operator target...');
      operatorTargetAddr = await getImplementationAddress(hardhat.ethers.provider, operatorAddr);
      deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_OPERATOR_TARGET] = operatorTargetAddr;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    } else {
      operatorTargetAddr = deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_OPERATOR_TARGET];
    }
    console.log('operator target', operatorTargetAddr);

    // verify target contract
    if ((!(logName.DEPLOY_LOG_FASTSETTLEMENT_OPERATOR_TARGET_VERIFIED in deployLog) || force) && !skipVerify) {
      await verifyContractCode(hardhat, operatorTargetAddr, [
        operatorRegistry,
        vaultOptInService,
        networkOptInService,
        vaultFactory,
        networkRegistry,
        fastSettlementMiddleware,
      ]);
      deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_OPERATOR_TARGET_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }

    // verify proxy contract
    if ((!(logName.DEPLOY_LOG_FASTSETTLEMENT_OPERATOR_VERIFIED in deployLog) || force) && !skipVerify) {
      await verifyContractCode(hardhat, operatorAddr, []);
      deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_OPERATOR_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }
  });

task('upgradeFastSettlementOperator', 'Upgrade operator')
  .addParam('operatorregistry', 'the operatorRegistry address', undefined, types.string, false)
  .addParam('vaultoptinservice', 'the vaultOptInService address', undefined, types.string, false)
  .addParam('networkoptinservice', 'the networkOptInService address', undefined, types.string, false)
  .addParam('vaultfactory', 'the vaultFactory address', undefined, types.string, false)
  .addParam('networkregistry', 'the networkRegistry address', undefined, types.string, false)
  .addParam('fastsettlementmiddleware', 'the fastSettlementMiddleware address', undefined, types.string, false)
  .addParam('skipVerify', 'Skip verify', false, types.boolean, true)
  .setAction(async (taskArgs, hardhat) => {
    let operatorRegistry = taskArgs.operatorregistry;
    let vaultOptInService = taskArgs.vaultoptinservice;
    let networkOptInService = taskArgs.networkoptinservice;
    let vaultFactory = taskArgs.vaultfactory;
    let networkRegistry = taskArgs.networkregistry;
    let fastSettlementMiddleware = taskArgs.fastsettlementmiddleware;
    let skipVerify = taskArgs.skipVerify;
    console.log('skip verify contracts?', skipVerify);

    const { deployLogPath, deployLog } = createOrGetDeployLog(logName.DEPLOY_FASTSETTLEMENT_OPERATOR_LOG_PREFIX);
    const contractAddr = deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_OPERATOR];
    if (contractAddr === undefined) {
      console.log('operator address not exist');
      return;
    }
    console.log('operator', contractAddr);
    const oldContractTargetAddr = deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_OPERATOR_TARGET];
    if (oldContractTargetAddr === undefined) {
      console.log('operator target address not exist');
      return;
    }
    console.log('operator old target', oldContractTargetAddr);

    const contractDeployer = new ChainContractDeployer(hardhat);
    await contractDeployer.init();

    console.log('upgrade operator...');
    const contract = await contractDeployer.upgradeProxy('FastSettlementOperator', contractAddr, [
      operatorRegistry,
      vaultOptInService,
      networkOptInService,
      vaultFactory,
      networkRegistry,
      fastSettlementMiddleware,
    ]);
    const tx = await getDeployTx(contract);
    console.log('upgrade tx', tx.hash);
    const newContractTargetAddr = await getImplementationAddress(hardhat.ethers.provider, contractAddr);
    deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_OPERATOR_TARGET] = newContractTargetAddr;
    console.log('operator new target', newContractTargetAddr);
    fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));

    // verify target contract
    if (!skipVerify) {
      await verifyContractCode(hardhat, newContractTargetAddr, [
        operatorRegistry,
        vaultOptInService,
        networkOptInService,
        vaultFactory,
        networkRegistry,
        fastSettlementMiddleware,
      ]);
      deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_OPERATOR_TARGET_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }
  });

task('deployFastSettlementOperatorTarget', 'Deploy operator target')
  .addParam('operatorregistry', 'the operatorRegistry address', undefined, types.string, false)
  .addParam('vaultoptinservice', 'the vaultOptInService address', undefined, types.string, false)
  .addParam('networkoptinservice', 'the networkOptInService address', undefined, types.string, false)
  .addParam('vaultfactory', 'the vaultFactory address', undefined, types.string, false)
  .addParam('networkregistry', 'the networkRegistry address', undefined, types.string, false)
  .addParam('fastsettlementmiddleware', 'the fastSettlementMiddleware address', undefined, types.string, false)
  .addParam('skipVerify', 'Skip verify', false, types.boolean, true)
  .setAction(async (taskArgs, hardhat) => {
    let operatorRegistry = taskArgs.operatorregistry;
    let vaultOptInService = taskArgs.vaultoptinservice;
    let networkOptInService = taskArgs.networkoptinservice;
    let vaultFactory = taskArgs.vaultfactory;
    let networkRegistry = taskArgs.networkregistry;
    let fastSettlementMiddleware = taskArgs.fastsettlementmiddleware;
    let skipVerify = taskArgs.skipVerify;
    console.log('skip verify contracts?', skipVerify);

    const { deployLogPath, deployLog } = createOrGetDeployLog(logName.DEPLOY_FASTSETTLEMENT_OPERATOR_LOG_PREFIX);

    const contractDeployer = new ChainContractDeployer(hardhat);
    await contractDeployer.init();

    const contract = await contractDeployer.deployContract('FastSettlementOperator', [
      operatorRegistry,
      vaultOptInService,
      networkOptInService,
      vaultFactory,
      networkRegistry,
      fastSettlementMiddleware,
    ]);
    const tx = await getDeployTx(contract);
    console.log('deploy tx', tx.hash);
    const contractAddr = await contract.getAddress();
    deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_OPERATOR_TARGET] = contractAddr;
    fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));

    // verify target contract
    if (!skipVerify) {
      await verifyContractCode(hardhat, contractAddr, [
        operatorRegistry,
        vaultOptInService,
        networkOptInService,
        vaultFactory,
        networkRegistry,
        fastSettlementMiddleware,
      ]);
      deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_OPERATOR_TARGET_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }
  });
