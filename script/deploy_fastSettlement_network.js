const fs = require('fs');
const { getImplementationAddress } = require('@openzeppelin/upgrades-core');
const { verifyContractCode, createOrGetDeployLog, ChainContractDeployer, getDeployTx } = require('./utils');
const logName = require('./deploy_log_name');
const { task, types } = require('hardhat/config');

task('deployFastSettlementNetwork', 'Deploy fastSettlement network')
  .addParam('force', 'Fore redeploy all contracts', false, types.boolean, true)
  .addParam('networkregistry', 'the networkRegistry address', undefined, types.string, false)
  .addParam('metadataservice', 'the metadataService address', undefined, types.string, false)
  .addParam('networkmiddlewareservice', 'the networkMiddlewareService address', undefined, types.string, false)
  .addParam('vaultfactory', 'the vaultFactory address', undefined, types.string, false)
  .addParam('skipVerify', 'Skip verify', false, types.boolean, true)
  .setAction(async (taskArgs, hardhat) => {
    let force = taskArgs.force;
    let networkRegistry = taskArgs.networkregistry;
    let metadataService = taskArgs.metadataservice;
    let networkMiddlewareService = taskArgs.networkmiddlewareservice;
    let vaultFactory = taskArgs.vaultfactory;
    let skipVerify = taskArgs.skipVerify;
    console.log('skip verify contracts?', skipVerify);

    const contractDeployer = new ChainContractDeployer(hardhat);
    await contractDeployer.init();
    const deployerWallet = contractDeployer.deployerWallet;

    const { deployLogPath, deployLog } = createOrGetDeployLog(logName.DEPLOY_FASTSETTLEMENT_NETWORK_LOG_PREFIX);
    deployLog[logName.DEPLOY_LOG_GOVERNOR] = deployerWallet.address;
    fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));

    let networkAddr;
    if (!(logName.DEPLOY_LOG_FASTSETTLEMENT_NETWORK in deployLog) || force) {
      console.log('deploy fastSettlement network...');
      const contract = await contractDeployer.deployProxy(
        'FastSettlementNetwork',
        [],
        [networkRegistry, metadataService, networkMiddlewareService, vaultFactory],
      );
      const transaction = await getDeployTx(contract);
      networkAddr = await contract.getAddress();
      deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_NETWORK] = networkAddr;
      deployLog[logName.DEPLOY_LOG_DEPLOY_TX_HASH] = transaction.hash;
      deployLog[logName.DEPLOY_LOG_DEPLOY_BLOCK_NUMBER] = transaction.blockNumber;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    } else {
      networkAddr = deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_NETWORK];
    }
    console.log('fastSettlement network', networkAddr);

    let networkTargetAddr;
    if (!(logName.DEPLOY_LOG_FASTSETTLEMENT_NETWORK_TARGET in deployLog) || force) {
      console.log('get fastSettlement network target...');
      networkTargetAddr = await getImplementationAddress(hardhat.ethers.provider, networkAddr);
      deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_NETWORK_TARGET] = networkTargetAddr;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    } else {
      networkTargetAddr = deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_NETWORK_TARGET];
    }
    console.log('fastSettlement network target', networkTargetAddr);

    // verify target contract
    if ((!(logName.DEPLOY_LOG_FASTSETTLEMENT_NETWORK_TARGET_VERIFIED in deployLog) || force) && !skipVerify) {
      await verifyContractCode(hardhat, networkTargetAddr, [
        networkRegistry,
        metadataService,
        networkMiddlewareService,
        vaultFactory,
      ]);
      deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_NETWORK_TARGET_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }

    // verify proxy contract
    if ((!(logName.DEPLOY_LOG_FASTSETTLEMENT_NETWORK_VERIFIED in deployLog) || force) && !skipVerify) {
      await verifyContractCode(hardhat, networkAddr, []);
      deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_NETWORK_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }
  });

task('upgradeFastSettlementNetwork', 'Upgrade fastSettlement network')
  .addParam('networkRegistry', 'the networkRegistry address', undefined, types.string, false)
  .addParam('metadataService', 'the metadataService address', undefined, types.string, false)
  .addParam('networkMiddlewareService', 'the networkMiddlewareService address', undefined, types.string, false)
  .addParam('vaultFactory', 'the vaultFactory address', undefined, types.string, false)
  .addParam('skipVerify', 'Skip verify', false, types.boolean, true)
  .setAction(async (taskArgs, hardhat) => {
    let networkRegistry = taskArgs.networkRegistry;
    let metadataService = taskArgs.metadataService;
    let networkMiddlewareService = taskArgs.networkMiddlewareService;
    let vaultFactory = taskArgs.vaultFactory;
    let skipVerify = taskArgs.skipVerify;
    console.log('skip verify contracts?', skipVerify);

    const { deployLogPath, deployLog } = createOrGetDeployLog(logName.DEPLOY_FASTSETTLEMENT_NETWORK_LOG_PREFIX);
    const contractAddr = deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_NETWORK];
    if (contractAddr === undefined) {
      console.log('fastSettlement network address not exist');
      return;
    }
    console.log('fastSettlement network', contractAddr);
    const oldContractTargetAddr = deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_NETWORK_TARGET];
    if (oldContractTargetAddr === undefined) {
      console.log('fastSettlement network target address not exist');
      return;
    }
    console.log('fastSettlement network old target', oldContractTargetAddr);

    const contractDeployer = new ChainContractDeployer(hardhat);
    await contractDeployer.init();

    console.log('upgrade fastSettlement network...');
    const contract = await contractDeployer.upgradeProxy('FastSettlementNetwork', contractAddr, [
      networkRegistry,
      metadataService,
      networkMiddlewareService,
      vaultFactory,
    ]);
    const tx = await getDeployTx(contract);
    console.log('upgrade tx', tx.hash);
    const newContractTargetAddr = await getImplementationAddress(hardhat.ethers.provider, contractAddr);
    deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_NETWORK_TARGET] = newContractTargetAddr;
    console.log('fastSettlement network new target', newContractTargetAddr);
    fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));

    // verify target contract
    if (!skipVerify) {
      await verifyContractCode(hardhat, newContractTargetAddr, [
        networkRegistry,
        metadataService,
        networkMiddlewareService,
        vaultFactory,
      ]);
      deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_NETWORK_TARGET_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }
  });

task('deployFastSettlementNetworkTarget', 'Deploy fastSettlement network target')
  .addParam('networkRegistry', 'the networkRegistry address', undefined, types.string, false)
  .addParam('metadataService', 'the metadataService address', undefined, types.string, false)
  .addParam('networkMiddlewareService', 'the networkMiddlewareService address', undefined, types.string, false)
  .addParam('vaultFactory', 'the vaultFactory address', undefined, types.string, false)
  .addParam('skipVerify', 'Skip verify', false, types.boolean, true)
  .setAction(async (taskArgs, hardhat) => {
    let networkRegistry = taskArgs.networkRegistry;
    let metadataService = taskArgs.metadataService;
    let networkMiddlewareService = taskArgs.networkMiddlewareService;
    let vaultFactory = taskArgs.vaultFactory;
    let skipVerify = taskArgs.skipVerify;
    console.log('skip verify contracts?', skipVerify);

    const { deployLogPath, deployLog } = createOrGetDeployLog(logName.DEPLOY_FASTSETTLEMENT_NETWORK_LOG_PREFIX);

    const contractDeployer = new ChainContractDeployer(hardhat);
    await contractDeployer.init();

    const contract = await contractDeployer.deployContract('FastSettlementNetwork', [
      networkRegistry,
      metadataService,
      networkMiddlewareService,
      vaultFactory,
    ]);
    const tx = await getDeployTx(contract);
    console.log('deploy tx', tx.hash);
    const contractAddr = await contract.getAddress();
    deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_NETWORK_TARGET] = contractAddr;
    fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));

    // verify target contract
    if (!skipVerify) {
      await verifyContractCode(hardhat, contractAddr, [
        networkRegistry,
        metadataService,
        networkMiddlewareService,
        vaultFactory,
      ]);
      deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_NETWORK_TARGET_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }
  });
