const fs = require('fs');
const { getImplementationAddress } = require('@openzeppelin/upgrades-core');
const { verifyContractCode, createOrGetDeployLog, ChainContractDeployer, getDeployTx } = require('./utils');
const logName = require('./deploy_log_name');
const { task, types } = require('hardhat/config');

task('deployFastSettlementMiddleware', 'Deploy fastSettlement middleware')
  .addParam('force', 'Fore redeploy all contracts', false, types.boolean, true)
  .addParam('fsNetwork', 'The FastSettlementNetwork contract address', undefined, types.string, false)
  .addParam('operatorRegistry', 'The OperatorRegistry contract address', undefined, types.string, false)
  .addParam('vaultFactory', 'The VaultFactory contract address', undefined, types.string, false)
  .addParam('networkOptinService', 'The NetworkOptInService contract address', undefined, types.string, false)
  .addParam('arbitrator', 'The Arbitrator contract address', undefined, types.string, false)
  .addParam('tokenPriceOracle', 'The TokenPriceOracle contract address', undefined, types.string, false)
  .addParam('epochDuration', 'The epoch duration', undefined, types.int, false)
  .addParam('slashingWindow', 'The slash window duration', undefined, types.int, false)
  .addParam('skipVerify', 'Skip verify', false, types.boolean, true)
  .setAction(async (taskArgs, hardhat) => {
    let force = taskArgs.force;
    let fsNetwork = taskArgs.fsNetwork;
    let operatorRegistry = taskArgs.operatorRegistry;
    let vaultFactory = taskArgs.vaultFactory;
    let networkOptinService = taskArgs.networkOptinService;
    let arbitrator = taskArgs.arbitrator;
    let tokenPriceOracle = taskArgs.tokenPriceOracle;
    let epochDuration = taskArgs.epochDuration;
    let slashingWindow = taskArgs.slashingWindow;
    let skipVerify = taskArgs.skipVerify;
    console.log('skip verify contracts?', skipVerify);

    const contractDeployer = new ChainContractDeployer(hardhat);
    await contractDeployer.init();
    const deployerWallet = contractDeployer.deployerWallet;

    const { deployLogPath, deployLog } = createOrGetDeployLog(logName.DEPLOY_FASTSETTLEMENT_MIDDLEWARE_LOG_PREFIX);
    deployLog[logName.DEPLOY_LOG_GOVERNOR] = deployerWallet.address;
    fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));

    let middlewareAddr;
    if (!(logName.DEPLOY_LOG_FASTSETTLEMENT_MIDDLEWARE in deployLog) || force) {
      console.log('deploy fastSettlement middleware...');
      const contract = await contractDeployer.deployProxy(
        'FastSettlementMiddleware',
        [],
        [
          fsNetwork,
          operatorRegistry,
          vaultFactory,
          networkOptinService,
          arbitrator,
          tokenPriceOracle,
          epochDuration,
          slashingWindow,
        ],
      );
      const transaction = await getDeployTx(contract);
      middlewareAddr = await contract.getAddress();
      deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_MIDDLEWARE] = middlewareAddr;
      deployLog[logName.DEPLOY_LOG_DEPLOY_TX_HASH] = transaction.hash;
      deployLog[logName.DEPLOY_LOG_DEPLOY_BLOCK_NUMBER] = transaction.blockNumber;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    } else {
      middlewareAddr = deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_MIDDLEWARE];
    }
    console.log('fastSettlement middleware', middlewareAddr);

    let middlewareTargetAddr;
    if (!(logName.DEPLOY_LOG_FASTSETTLEMENT_MIDDLEWARE_TARGET in deployLog) || force) {
      console.log('get fastSettlement middleware target...');
      middlewareTargetAddr = await getImplementationAddress(hardhat.ethers.provider, middlewareAddr);
      deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_MIDDLEWARE_TARGET] = middlewareTargetAddr;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    } else {
      middlewareTargetAddr = deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_MIDDLEWARE_TARGET];
    }
    console.log('fastSettlement middleware target', middlewareTargetAddr);

    // verify target contract
    if ((!(logName.DEPLOY_LOG_FASTSETTLEMENT_MIDDLEWARE_TARGET_VERIFIED in deployLog) || force) && !skipVerify) {
      await verifyContractCode(hardhat, middlewareTargetAddr, [
        fsNetwork,
        operatorRegistry,
        vaultFactory,
        networkOptinService,
        arbitrator,
        tokenPriceOracle,
        epochDuration,
        slashingWindow,
      ]);
      deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_MIDDLEWARE_TARGET_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }

    // verify proxy contract
    if ((!(logName.DEPLOY_LOG_FASTSETTLEMENT_MIDDLEWARE_VERIFIED in deployLog) || force) && !skipVerify) {
      await verifyContractCode(hardhat, middlewareAddr, []);
      deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_MIDDLEWARE_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }
  });

task('upgradeFastSettlementMiddleware', 'Upgrade fastSettlement middleware')
  .addParam('fsNetwork', 'The FastSettlementNetwork contract address', undefined, types.string, false)
  .addParam('operatorRegistry', 'The OperatorRegistry contract address', undefined, types.string, false)
  .addParam('vaultFactory', 'The VaultFactory contract address', undefined, types.string, false)
  .addParam('networkOptinService', 'The NetworkOptInService contract address', undefined, types.string, false)
  .addParam('arbitrator', 'The Arbitrator contract address', undefined, types.string, false)
  .addParam('tokenPriceOracle', 'The TokenPriceOracle contract address', undefined, types.string, false)
  .addParam('epochDuration', 'The epoch duration', undefined, types.int, false)
  .addParam('slashingWindow', 'The slash window duration', undefined, types.int, false)
  .addParam('skipVerify', 'Skip verify', false, types.boolean, true)
  .setAction(async (taskArgs, hardhat) => {
    let fsNetwork = taskArgs.fsNetwork;
    let operatorRegistry = taskArgs.operatorRegistry;
    let vaultFactory = taskArgs.vaultFactory;
    let networkOptinService = taskArgs.networkOptinService;
    let arbitrator = taskArgs.arbitrator;
    let tokenPriceOracle = taskArgs.tokenPriceOracle;
    let epochDuration = taskArgs.epochDuration;
    let slashingWindow = taskArgs.slashingWindow;
    let skipVerify = taskArgs.skipVerify;
    console.log('skip verify contracts?', skipVerify);

    const { deployLogPath, deployLog } = createOrGetDeployLog(logName.DEPLOY_FASTSETTLEMENT_MIDDLEWARE_LOG_PREFIX);
    const contractAddr = deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_MIDDLEWARE];
    if (contractAddr === undefined) {
      console.log('fastSettlement middleware address not exist');
      return;
    }
    console.log('fastSettlement middleware', contractAddr);
    const oldContractTargetAddr = deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_MIDDLEWARE_TARGET];
    if (oldContractTargetAddr === undefined) {
      console.log('fastSettlement middleware target address not exist');
      return;
    }
    console.log('fastSettlement middleware old target', oldContractTargetAddr);

    const contractDeployer = new ChainContractDeployer(hardhat);
    await contractDeployer.init();

    console.log('upgrade fastSettlement middleware...');
    const contract = await contractDeployer.upgradeProxy('FastSettlementMiddleware', contractAddr, [
      fsNetwork,
      operatorRegistry,
      vaultFactory,
      networkOptinService,
      arbitrator,
      tokenPriceOracle,
      epochDuration,
      slashingWindow,
    ]);
    const tx = await getDeployTx(contract);
    console.log('upgrade tx', tx.hash);
    const newContractTargetAddr = await getImplementationAddress(hardhat.ethers.provider, contractAddr);
    deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_MIDDLEWARE_TARGET] = newContractTargetAddr;
    console.log('fastSettlement middleware new target', newContractTargetAddr);
    fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));

    // verify target contract
    if (!skipVerify) {
      await verifyContractCode(hardhat, newContractTargetAddr, [
        fsNetwork,
        operatorRegistry,
        vaultFactory,
        networkOptinService,
        arbitrator,
        tokenPriceOracle,
        epochDuration,
        slashingWindow,
      ]);
      deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_MIDDLEWARE_TARGET_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }
  });

task('deployFastSettlementMiddlewareTarget', 'Deploy fastSettlement middleware target')
  .addParam('fsNetwork', 'The FastSettlementNetwork contract address', undefined, types.string, false)
  .addParam('operatorRegistry', 'The OperatorRegistry contract address', undefined, types.string, false)
  .addParam('vaultFactory', 'The VaultFactory contract address', undefined, types.string, false)
  .addParam('networkOptinService', 'The NetworkOptInService contract address', undefined, types.string, false)
  .addParam('arbitrator', 'The Arbitrator contract address', undefined, types.string, false)
  .addParam('tokenPriceOracle', 'The TokenPriceOracle contract address', undefined, types.string, false)
  .addParam('epochDuration', 'The epoch duration', undefined, types.int, false)
  .addParam('slashingWindow', 'The slash window duration', undefined, types.int, false)
  .addParam('skipVerify', 'Skip verify', false, types.boolean, true)
  .setAction(async (taskArgs, hardhat) => {
    let fsNetwork = taskArgs.fsNetwork;
    let operatorRegistry = taskArgs.operatorRegistry;
    let vaultFactory = taskArgs.vaultFactory;
    let networkOptinService = taskArgs.networkOptinService;
    let arbitrator = taskArgs.arbitrator;
    let tokenPriceOracle = taskArgs.tokenPriceOracle;
    let epochDuration = taskArgs.epochDuration;
    let slashingWindow = taskArgs.slashingWindow;
    let skipVerify = taskArgs.skipVerify;
    console.log('skip verify contracts?', skipVerify);

    const { deployLogPath, deployLog } = createOrGetDeployLog(logName.DEPLOY_FASTSETTLEMENT_MIDDLEWARE_LOG_PREFIX);

    const contractDeployer = new ChainContractDeployer(hardhat);
    await contractDeployer.init();

    const contract = await contractDeployer.deployContract('FastSettlementMiddleware', [
      fsNetwork,
      operatorRegistry,
      vaultFactory,
      networkOptinService,
      arbitrator,
      tokenPriceOracle,
      epochDuration,
      slashingWindow,
    ]);
    const tx = await getDeployTx(contract);
    console.log('deploy tx', tx.hash);
    const contractAddr = await contract.getAddress();
    deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_MIDDLEWARE_TARGET] = contractAddr;
    fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));

    // verify target contract
    if (!skipVerify) {
      await verifyContractCode(hardhat, contractAddr, [
        fsNetwork,
        operatorRegistry,
        vaultFactory,
        networkOptinService,
        arbitrator,
        tokenPriceOracle,
        epochDuration,
        slashingWindow,
      ]);
      deployLog[logName.DEPLOY_LOG_FASTSETTLEMENT_MIDDLEWARE_TARGET_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }
  });
