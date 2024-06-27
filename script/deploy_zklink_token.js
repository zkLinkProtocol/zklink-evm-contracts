const fs = require('fs');
const { getImplementationAddress } = require('@openzeppelin/upgrades-core');
const { verifyContractCode, createOrGetDeployLog, ChainContractDeployer, getDeployTx } = require('./utils');
const logName = require('./deploy_log_name');
const { task, types } = require('hardhat/config');

task('deployZkLinkToken', 'Deploy zkLink token')
  .addOptionalParam('skipVerify', 'Skip verify', false, types.boolean)
  .setAction(async (taskArgs, hardhat) => {
    let skipVerify = taskArgs.skipVerify;
    console.log('skip verify contracts?', skipVerify);

    const contractDeployer = new ChainContractDeployer(hardhat);
    await contractDeployer.init();
    const deployerWallet = contractDeployer.deployerWallet;

    const { deployLogPath, deployLog } = createOrGetDeployLog(logName.DEPLOY_ZKLINK_TOKEN_LOG_PREFIX);
    deployLog[logName.DEPLOY_LOG_GOVERNOR] = deployerWallet.address;
    fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));

    // deploy zkLink token
    let zkLinkTokenAddr;
    if (!(logName.DEPLOY_LOG_ZKLINK_TOKEN_PROXY in deployLog)) {
      console.log('deploy zkLink token...');
      const contract = await contractDeployer.deployProxy('ZkLinkToken', [], []);
      const transaction = await getDeployTx(contract);
      zkLinkTokenAddr = await contract.getAddress();
      deployLog[logName.DEPLOY_LOG_ZKLINK_TOKEN_PROXY] = zkLinkTokenAddr;
      deployLog[logName.DEPLOY_LOG_DEPLOY_TX_HASH] = transaction.hash;
      deployLog[logName.DEPLOY_LOG_DEPLOY_BLOCK_NUMBER] = transaction.blockNumber;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    } else {
      zkLinkTokenAddr = deployLog[logName.DEPLOY_LOG_ZKLINK_TOKEN_PROXY];
    }
    console.log('zkLinkToken', zkLinkTokenAddr);

    let zkLinkTokenTargetAddr;
    if (!(logName.DEPLOY_LOG_ZKLINK_TOKEN_TARGET in deployLog)) {
      console.log('get zkLink token target...');
      zkLinkTokenTargetAddr = await getImplementationAddress(hardhat.ethers.provider, zkLinkTokenAddr);
      deployLog[logName.DEPLOY_LOG_ZKLINK_TOKEN_TARGET] = zkLinkTokenTargetAddr;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    } else {
      zkLinkTokenTargetAddr = deployLog[logName.DEPLOY_LOG_ZKLINK_TOKEN_TARGET];
    }
    console.log('zkLink token target', zkLinkTokenTargetAddr);

    // verify target contract
    if (!(logName.DEPLOY_LOG_ZKLINK_TOKEN_TARGET_VERIFIED in deployLog) && !skipVerify) {
      await verifyContractCode(hardhat, zkLinkTokenTargetAddr, []);
      deployLog[logName.DEPLOY_LOG_ZKLINK_TOKEN_TARGET_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }

    // verify proxy contract
    if (!(logName.DEPLOY_LOG_ZKLINK_TOKEN_PROXY_VERIFIED in deployLog) && !skipVerify) {
      await verifyContractCode(hardhat, zkLinkTokenAddr, []);
      deployLog[logName.DEPLOY_LOG_ZKLINK_TOKEN_PROXY_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }
  });

task('deployZkLinkTokenTarget', 'Deploy zkLink token target')
  .addOptionalParam('skipVerify', 'Skip verify', false, types.boolean)
  .setAction(async (taskArgs, hardhat) => {
    let skipVerify = taskArgs.skipVerify;
    console.log('skip verify contracts?', skipVerify);

    const contractDeployer = new ChainContractDeployer(hardhat);
    await contractDeployer.init();

    // deploy zkLink token target
    console.log('deploy zkLink token target...');
    const contract = await contractDeployer.deployContract('ZkLinkToken', [], []);
    const zkLinkTokenTargetAddr = await contract.getAddress();
    console.log('zkLinkTokenTarget', zkLinkTokenTargetAddr);

    // verify target contract
    if (!skipVerify) {
      await verifyContractCode(hardhat, zkLinkTokenTargetAddr, []);
    }
  });
