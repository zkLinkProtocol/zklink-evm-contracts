const fs = require('fs');
const { getImplementationAddress } = require('@openzeppelin/upgrades-core');
const {
  verifyContractCode,
  createOrGetDeployLog,
  ChainContractDeployer,
  getDeployTx,
  readDeployLogField,
} = require('./utils');
const logName = require('./deploy_log_name');
const { task, types } = require('hardhat/config');

task('deployERC20Bridge', 'Deploy erc20 bridge')
  .addParam('zklink', 'The zklink address (default get from zkLink deploy log)', undefined, types.string, true)
  .addParam('force', 'Fore redeploy all contracts', false, types.boolean, true)
  .addParam('skipVerify', 'Skip verify', false, types.boolean, true)
  .setAction(async (taskArgs, hardhat) => {
    let zklinkAddr = taskArgs.zklink;
    if (zklinkAddr === undefined) {
      zklinkAddr = readDeployLogField(logName.DEPLOY_ZKLINK_LOG_PREFIX, logName.DEPLOY_LOG_ZKLINK_PROXY);
    }
    let force = taskArgs.force;
    let skipVerify = taskArgs.skipVerify;
    console.log('zklink', zklinkAddr);
    console.log('force redeploy all contracts?', force);
    console.log('skip verify contracts?', skipVerify);

    const contractDeployer = new ChainContractDeployer(hardhat);
    await contractDeployer.init();
    const deployerWallet = contractDeployer.deployerWallet;

    const { deployLogPath, deployLog } = createOrGetDeployLog(logName.DEPLOY_ERC20_BRIDGE_LOG_PREFIX);
    deployLog[logName.DEPLOY_LOG_GOVERNOR] = deployerWallet.address;
    fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));

    let erc20BridgeAddr;
    if (!(logName.DEPLOY_ERC20_BRIDGE in deployLog) || force) {
      console.log('deploy erc20 bridge...');
      const contract = await contractDeployer.deployProxy('L1ERC20Bridge', [], [zklinkAddr], 'transparent', false);
      const transaction = await getDeployTx(contract);
      erc20BridgeAddr = await contract.getAddress();
      deployLog[logName.DEPLOY_ERC20_BRIDGE] = erc20BridgeAddr;
      deployLog[logName.DEPLOY_LOG_DEPLOY_TX_HASH] = transaction.hash;
      deployLog[logName.DEPLOY_LOG_DEPLOY_BLOCK_NUMBER] = transaction.blockNumber;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    } else {
      erc20BridgeAddr = deployLog[logName.DEPLOY_ERC20_BRIDGE];
    }
    console.log('erc20 bridge', erc20BridgeAddr);

    let erc20BridgeTargetAddr;
    if (!(logName.DEPLOY_ERC20_BRIDGE_TARGET in deployLog) || force) {
      console.log('get erc20 bridge target...');
      erc20BridgeTargetAddr = await getImplementationAddress(hardhat.ethers.provider, erc20BridgeAddr);
      deployLog[logName.DEPLOY_ERC20_BRIDGE_TARGET] = erc20BridgeTargetAddr;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    } else {
      erc20BridgeTargetAddr = deployLog[logName.DEPLOY_ERC20_BRIDGE_TARGET];
    }
    console.log('erc20 bridge target', erc20BridgeTargetAddr);

    // set allowance
    const zkLink = await hardhat.ethers.getContractAt('ZkLink', zklinkAddr);
    const isAllow = await zkLink.allowLists(erc20BridgeAddr);
    if (!isAllow) {
      console.log('set allow for erc20 bridge...');
      await zkLink.setAllowList(erc20BridgeAddr, true);
      console.log('set allow success');
    } else {
      console.log('already allowed');
    }

    // verify target contract
    if ((!(logName.DEPLOY_ERC20_BRIDGE_TARGET_VERIFIED in deployLog) || force) && !skipVerify) {
      await verifyContractCode(hardhat, erc20BridgeTargetAddr, [zklinkAddr]);
      deployLog[logName.DEPLOY_ERC20_BRIDGE_TARGET_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }

    // verify proxy contract
    if ((!(logName.DEPLOY_ERC20_BRIDGE_VERIFIED in deployLog) || force) && !skipVerify) {
      await verifyContractCode(hardhat, erc20BridgeAddr, []);
      deployLog[logName.DEPLOY_ERC20_BRIDGE_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }
  });

task('upgradeERC20Bridge', 'Upgrade erc20 bridge')
  .addParam('zklink', 'The zklink address (default get from zkLink deploy log)', undefined, types.string, true)
  .addParam('skipVerify', 'Skip verify', false, types.boolean, true)
  .setAction(async (taskArgs, hardhat) => {
    let zklinkAddr = taskArgs.zklink;
    if (zklinkAddr === undefined) {
      zklinkAddr = readDeployLogField(logName.DEPLOY_ZKLINK_LOG_PREFIX, logName.DEPLOY_LOG_ZKLINK_PROXY);
    }
    let skipVerify = taskArgs.skipVerify;
    console.log('zklink', zklinkAddr);
    console.log('skip verify contracts?', skipVerify);

    const { deployLogPath, deployLog } = createOrGetDeployLog(logName.DEPLOY_ERC20_BRIDGE_LOG_PREFIX);
    const contractAddr = deployLog[logName.DEPLOY_ERC20_BRIDGE];
    if (contractAddr === undefined) {
      console.log('erc20 bridge address not exist');
      return;
    }
    console.log('erc20 bridge', contractAddr);
    const oldContractTargetAddr = deployLog[logName.DEPLOY_ERC20_BRIDGE_TARGET];
    if (oldContractTargetAddr === undefined) {
      console.log('erc20 bridge target address not exist');
      return;
    }
    console.log('erc20 bridge old target', oldContractTargetAddr);

    const contractDeployer = new ChainContractDeployer(hardhat);
    await contractDeployer.init();

    console.log('upgrade erc20 bridge...');
    const contract = await contractDeployer.upgradeProxy('L1ERC20Bridge', contractAddr, [zklinkAddr]);
    const tx = await getDeployTx(contract);
    console.log('upgrade tx', tx.hash);
    const newContractTargetAddr = await getImplementationAddress(hardhat.ethers.provider, contractAddr);
    deployLog[logName.DEPLOY_ERC20_BRIDGE_TARGET] = newContractTargetAddr;
    console.log('erc20 bridge new target', newContractTargetAddr);
    fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));

    // verify target contract
    if (!skipVerify) {
      await verifyContractCode(hardhat, newContractTargetAddr, [zklinkAddr]);
      deployLog[logName.DEPLOY_ERC20_BRIDGE_TARGET_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }
  });

task('deployERC20BridgeTarget', 'Deploy erc20 bridge target')
  .addParam('zklink', 'The zklink address (default get from zkLink deploy log)', undefined, types.string, true)
  .addParam('skipVerify', 'Skip verify', false, types.boolean, true)
  .setAction(async (taskArgs, hardhat) => {
    let zklinkAddr = taskArgs.zklink;
    if (zklinkAddr === undefined) {
      zklinkAddr = readDeployLogField(logName.DEPLOY_ZKLINK_LOG_PREFIX, logName.DEPLOY_LOG_ZKLINK_PROXY);
    }
    let skipVerify = taskArgs.skipVerify;
    console.log('zklink', zklinkAddr);
    console.log('skip verify contracts?', skipVerify);

    const { deployLogPath, deployLog } = createOrGetDeployLog(logName.DEPLOY_ERC20_BRIDGE_LOG_PREFIX);

    const contractDeployer = new ChainContractDeployer(hardhat);
    await contractDeployer.init();

    const contract = await contractDeployer.deployContract('L1ERC20Bridge', [zklinkAddr]);
    const tx = await getDeployTx(contract);
    console.log('deploy tx', tx.hash);
    const contractAddr = await contract.getAddress();
    deployLog[logName.DEPLOY_ERC20_BRIDGE_TARGET] = contractAddr;
    fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));

    // verify target contract
    if (!skipVerify) {
      await verifyContractCode(hardhat, contractAddr, [zklinkAddr]);
      deployLog[logName.DEPLOY_ERC20_BRIDGE_TARGET_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }
  });
