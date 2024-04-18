const fs = require('fs');
const { getImplementationAddress } = require('@openzeppelin/upgrades-core');
const {
  verifyContractCode,
  createOrGetDeployLog,
  ChainContractDeployer,
  getDeployTx,
  readDeployLogField,
  readDeployContract,
  getLogName,
} = require('./utils');
const logName = require('./deploy_log_name');
const { zkLinkConfig } = require('./zklink_config');
const { task, types } = require('hardhat/config');

task('deployL1Gateway', 'Deploy L1 Gateway')
  .addParam(
    'arbitrator',
    'The arbitrator address (default get from arbitrator deploy log)',
    undefined,
    types.string,
    true,
  )
  .addParam('targetNetwork', 'L2 network name', undefined, types.string, false)
  .addParam('force', 'Fore redeploy all contracts', false, types.boolean, true)
  .addParam('skipVerify', 'Skip verify', false, types.boolean, true)
  .setAction(async (taskArgs, hardhat) => {
    let arbitrator = taskArgs.arbitrator;
    if (arbitrator === undefined) {
      arbitrator = readDeployLogField(logName.DEPLOY_ARBITRATOR_LOG_PREFIX, logName.DEPLOY_LOG_ARBITRATOR);
    }
    let targetNetwork = taskArgs.targetNetwork;
    let force = taskArgs.force;
    let skipVerify = taskArgs.skipVerify;
    console.log('arbitrator', arbitrator);
    console.log('target network', targetNetwork);
    console.log('force redeploy all contracts?', force);
    console.log('skip verify contracts?', skipVerify);

    const l2ChainInfo = zkLinkConfig[targetNetwork];
    if (l2ChainInfo === undefined) {
      console.log('l2 chain info not exist');
      return;
    }
    const l1GatewayInfo = l2ChainInfo.l1Gateway;
    if (l1GatewayInfo === undefined) {
      console.log('l1 gateway info of l2 chain not exist');
      return;
    }

    const l1GatewayLogName = getLogName(logName.DEPLOY_L1_GATEWAY_LOG_PREFIX, targetNetwork);
    const { deployLogPath, deployLog } = createOrGetDeployLog(l1GatewayLogName);

    const contractDeployer = new ChainContractDeployer(hardhat);
    await contractDeployer.init();
    const deployerWallet = contractDeployer.deployerWallet;
    deployLog[logName.DEPLOY_LOG_GOVERNOR] = deployerWallet.address;
    fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));

    // deploy l1 gateway
    let gatewayAddr;
    const allConstructParams = [arbitrator].concat(l1GatewayInfo.constructParams);
    if (!(logName.DEPLOY_GATEWAY in deployLog) || force) {
      console.log('deploy l1 gateway...');
      const contract = await contractDeployer.deployProxy(l1GatewayInfo.contractName, [], allConstructParams);
      const transaction = await getDeployTx(contract);
      gatewayAddr = await contract.getAddress();
      deployLog[logName.DEPLOY_GATEWAY] = gatewayAddr;
      deployLog[logName.DEPLOY_LOG_DEPLOY_TX_HASH] = transaction.hash;
      deployLog[logName.DEPLOY_LOG_DEPLOY_BLOCK_NUMBER] = transaction.blockNumber;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    } else {
      gatewayAddr = deployLog[logName.DEPLOY_GATEWAY];
    }
    console.log('l1 gateway', gatewayAddr);

    let gatewayTargetAddr;
    if (!(logName.DEPLOY_GATEWAY_TARGET in deployLog) || force) {
      console.log('get l1 gateway target...');
      gatewayTargetAddr = await getImplementationAddress(hardhat.ethers.provider, gatewayAddr);
      deployLog[logName.DEPLOY_GATEWAY_TARGET] = gatewayTargetAddr;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    } else {
      gatewayTargetAddr = deployLog[logName.DEPLOY_GATEWAY_TARGET];
    }
    console.log('l1 gateway target', gatewayTargetAddr);

    // verify target contract
    if ((!(logName.DEPLOY_GATEWAY_TARGET_VERIFIED in deployLog) || force) && !skipVerify) {
      await verifyContractCode(hardhat, gatewayTargetAddr, allConstructParams);
      deployLog[logName.DEPLOY_GATEWAY_TARGET_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }

    // verify proxy contract
    if ((!(logName.DEPLOY_GATEWAY_VERIFIED in deployLog) || force) && !skipVerify) {
      await verifyContractCode(hardhat, gatewayAddr, []);
      deployLog[logName.DEPLOY_GATEWAY_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }
  });

task('upgradeL1Gateway', 'Upgrade l1 gateway')
  .addParam(
    'arbitrator',
    'The arbitrator address (default get from arbitrator deploy log)',
    undefined,
    types.string,
    true,
  )
  .addParam('targetNetwork', 'L2 network name', undefined, types.string, false)
  .addParam('skipVerify', 'Skip verify', false, types.boolean, true)
  .setAction(async (taskArgs, hardhat) => {
    let arbitrator = taskArgs.arbitrator;
    if (arbitrator === undefined) {
      arbitrator = readDeployLogField(logName.DEPLOY_ARBITRATOR_LOG_PREFIX, logName.DEPLOY_LOG_ARBITRATOR);
    }
    let skipVerify = taskArgs.skipVerify;
    let targetNetwork = taskArgs.targetNetwork;
    console.log('arbitrator', arbitrator);
    console.log('skipVerify', skipVerify);
    console.log('targetNetwork', targetNetwork);

    const l2ChainInfo = zkLinkConfig[targetNetwork];
    if (l2ChainInfo === undefined) {
      console.log('l2 chain info not exist');
      return;
    }
    const l1GatewayInfo = l2ChainInfo.l1Gateway;
    if (l1GatewayInfo === undefined) {
      console.log('l1 gateway info of l2 chain not exist');
      return;
    }

    const l1GatewayLogName = getLogName(logName.DEPLOY_L1_GATEWAY_LOG_PREFIX, targetNetwork);
    const { deployLogPath, deployLog } = createOrGetDeployLog(l1GatewayLogName);
    const contractAddr = deployLog[logName.DEPLOY_GATEWAY];
    if (contractAddr === undefined) {
      console.log('l1 gateway address not exist');
      return;
    }
    console.log('l1 gateway', contractAddr);
    const oldContractTargetAddr = deployLog[logName.DEPLOY_GATEWAY_TARGET];
    if (oldContractTargetAddr === undefined) {
      console.log('l1 gateway target address not exist');
      return;
    }
    console.log('l1 gateway old target', oldContractTargetAddr);

    const contractDeployer = new ChainContractDeployer(hardhat);
    await contractDeployer.init();

    console.log('upgrade l1 gateway...');
    const allConstructParams = [arbitrator].concat(l1GatewayInfo.constructParams);
    const contract = await contractDeployer.upgradeProxy(l1GatewayInfo.contractName, contractAddr, allConstructParams);
    const tx = await getDeployTx(contract);
    console.log('upgrade tx', tx.hash);
    const newContractTargetAddr = await getImplementationAddress(hardhat.ethers.provider, contractAddr);
    deployLog[logName.DEPLOY_GATEWAY_TARGET] = newContractTargetAddr;
    console.log('l1 gateway new target', newContractTargetAddr);
    fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));

    if (!skipVerify) {
      await verifyContractCode(hardhat, newContractTargetAddr, allConstructParams);
      deployLog[logName.DEPLOY_GATEWAY_TARGET_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }
  });

task('deployL1GatewayTarget', 'Deploy L1 gateway target')
  .addParam(
    'arbitrator',
    'The arbitrator address (default get from arbitrator deploy log)',
    undefined,
    types.string,
    true,
  )
  .addParam('targetNetwork', 'L2 network name', undefined, types.string, false)
  .addOptionalParam('skipVerify', 'Skip verify', false, types.boolean)
  .setAction(async (taskArgs, hardhat) => {
    let arbitrator = taskArgs.arbitrator;
    if (arbitrator === undefined) {
      arbitrator = readDeployLogField(logName.DEPLOY_ARBITRATOR_LOG_PREFIX, logName.DEPLOY_LOG_ARBITRATOR);
    }
    let skipVerify = taskArgs.skipVerify;
    let targetNetwork = taskArgs.targetNetwork;
    console.log('arbitrator', arbitrator);
    console.log('skipVerify', skipVerify);
    console.log('targetNetwork', targetNetwork);

    const l2ChainInfo = zkLinkConfig[targetNetwork];
    if (l2ChainInfo === undefined) {
      console.log('l2 chain info not exist');
      return;
    }
    const l1GatewayInfo = l2ChainInfo.l1Gateway;
    if (l1GatewayInfo === undefined) {
      console.log('l1 gateway info of l2 chain not exist');
      return;
    }

    const l1GatewayLogName = getLogName(logName.DEPLOY_L1_GATEWAY_LOG_PREFIX, targetNetwork);
    const { deployLogPath, deployLog } = createOrGetDeployLog(l1GatewayLogName);

    const contractDeployer = new ChainContractDeployer(hardhat);
    await contractDeployer.init();

    // deploy l1 gateway target
    console.log('deploy l1 gateway target...');
    const allConstructParams = [arbitrator].concat(l1GatewayInfo.constructParams);
    const contract = await contractDeployer.deployContract(l1GatewayInfo.contractName, allConstructParams);
    const tx = await getDeployTx(contract);
    console.log('deploy tx hash', tx.hash);
    const l1GatewayTargetAddr = await contract.getAddress();
    deployLog[logName.DEPLOY_GATEWAY_TARGET] = l1GatewayTargetAddr;
    console.log('l1 gateway target', l1GatewayTargetAddr);
    fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));

    if (!skipVerify) {
      await verifyContractCode(hardhat, l1GatewayTargetAddr, allConstructParams);
      deployLog[logName.DEPLOY_GATEWAY_TARGET_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }
  });

task('setL1GatewayRemoteGateway', 'Set remote gateway for L1 gateway')
  .addParam('targetNetwork', 'L2 network name', undefined, types.string, false)
  .setAction(async (taskArgs, hardhat) => {
    let targetNetwork = taskArgs.targetNetwork;
    console.log('targetNetwork', targetNetwork);

    const chainInfo = zkLinkConfig[targetNetwork];
    if (chainInfo === undefined) {
      console.log('current net not support');
      return;
    }

    const l1GatewayInfo = chainInfo.l1Gateway;
    if (l1GatewayInfo === undefined) {
      console.log('l1 gateway config not exist');
      return;
    }

    const l2GatewayInfo = chainInfo.l2Gateway;
    if (l2GatewayInfo === undefined) {
      console.log('l2 gateway config not exist');
      return;
    }

    const l1GatewayLogName = getLogName(logName.DEPLOY_L1_GATEWAY_LOG_PREFIX, targetNetwork);
    const l1GatewayAddr = readDeployContract(l1GatewayLogName, logName.DEPLOY_GATEWAY);
    if (l1GatewayAddr === undefined) {
      console.log('l1 gateway address not exist');
      return;
    }
    console.log('l1 gateway', l1GatewayAddr);

    const l2GatewayAddr = readDeployContract(
      logName.DEPLOY_L2_GATEWAY_LOG_PREFIX,
      logName.DEPLOY_GATEWAY,
      targetNetwork,
    );
    if (l2GatewayAddr === undefined) {
      console.log('l2 gateway address not exist');
      return;
    }
    console.log('l2 gateway', l2GatewayAddr);

    const l1Gateway = await hardhat.ethers.getContractAt(l1GatewayInfo.contractName, l1GatewayAddr);
    const existL2GatewayAddr = await l1Gateway.getRemoteGateway();
    if (existL2GatewayAddr !== hardhat.ethers.ZeroAddress) {
      console.log('l2 gateway has been set to', existL2GatewayAddr);
      return;
    }

    console.log('set remote gateway...');
    const tx = await l1Gateway.setRemoteGateway(l2GatewayAddr);
    await tx.wait();
    console.log('tx:', tx.hash);
  });
