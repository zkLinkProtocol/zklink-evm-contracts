const fs = require('fs');
const { getImplementationAddress } = require('@openzeppelin/upgrades-core');
const { verifyContractCode, getDeployTx, createOrGetDeployLog, ChainContractDeployer } = require('./utils');
const logName = require('./deploy_log_name');
const { zkLinkConfig } = require('./zklink_config');
const { task, types } = require('hardhat/config');

task('deployTokenPriceOracle', 'Deploy token price oracle')
  .addParam('admin', 'The admin address (default deployer address)', undefined, types.string, true)
  .addParam(
    'tokenPriceUpdater',
    'The tokenPriceUpdater address (default deployer address)',
    undefined,
    types.string,
    true,
  )
  .addParam('validTimePeriod', 'The validTimePeriod in seconds', 86400, types.int, true)
  .addParam('skipVerify', 'Skip verify', false, types.boolean, true)
  .setAction(async (taskArgs, hardhat) => {
    const contractDeployer = new ChainContractDeployer(hardhat);
    await contractDeployer.init();
    const deployerWallet = contractDeployer.deployerWallet;

    let admin = taskArgs.admin === undefined ? deployerWallet.address : taskArgs.admin;
    let tokenPriceUpdater =
      taskArgs.tokenPriceUpdater === undefined ? deployerWallet.address : taskArgs.tokenPriceUpdater;
    let validTimePeriod = taskArgs.validTimePeriod;
    const skipVerify = taskArgs.skipVerify;
    console.log('admin', admin);
    console.log('tokenPriceUpdater', tokenPriceUpdater);
    console.log('validTimePeriod', validTimePeriod);
    console.log('skip verify contracts?', skipVerify);

    const chainInfo = zkLinkConfig[process.env.NET];
    if (chainInfo === undefined) {
      console.log('current net not support');
      return;
    }
    const pyth = chainInfo.pyth;
    if (pyth === undefined) {
      console.log('pyth address not exist');
      return;
    }
    console.log('pyth', pyth);

    const { deployLogPath, deployLog } = createOrGetDeployLog(logName.DEPLOY_TOKEN_PRICE_ORACLE_LOG_PREFIX);
    deployLog[logName.DEPLOY_LOG_GOVERNOR] = admin;
    fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));

    // deploy token price oracle
    const allConstructParams = [pyth];
    let tokenPriceOracleAddr;
    if (!(logName.DEPLOY_LOG_TOKEN_PRICE_ORACLE_PROXY in deployLog)) {
      console.log('deploy token price oracle...');
      const contract = await contractDeployer.deployProxy(
        'TokenPriceOracle',
        [admin, tokenPriceUpdater, validTimePeriod],
        allConstructParams,
      );
      const transaction = await getDeployTx(contract);
      tokenPriceOracleAddr = await contract.getAddress();
      deployLog[logName.DEPLOY_LOG_TOKEN_PRICE_ORACLE_PROXY] = tokenPriceOracleAddr;
      deployLog[logName.DEPLOY_LOG_DEPLOY_TX_HASH] = transaction.hash;
      deployLog[logName.DEPLOY_LOG_DEPLOY_BLOCK_NUMBER] = transaction.blockNumber;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    } else {
      tokenPriceOracleAddr = deployLog[logName.DEPLOY_LOG_TOKEN_PRICE_ORACLE_PROXY];
    }
    console.log('token price oracle', tokenPriceOracleAddr);

    let tokenPriceOracleTargetAddr;
    if (!(logName.DEPLOY_LOG_TOKEN_PRICE_ORACLE_TARGET in deployLog)) {
      console.log('get token price oracle target...');
      tokenPriceOracleTargetAddr = await getImplementationAddress(hardhat.ethers.provider, tokenPriceOracleAddr);
      deployLog[logName.DEPLOY_LOG_TOKEN_PRICE_ORACLE_TARGET] = tokenPriceOracleTargetAddr;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    } else {
      tokenPriceOracleTargetAddr = deployLog[logName.DEPLOY_LOG_TOKEN_PRICE_ORACLE_TARGET];
    }
    console.log('token price oracle target', tokenPriceOracleTargetAddr);

    // verify target contract
    if (!(logName.DEPLOY_LOG_TOKEN_PRICE_ORACLE_TARGET_VERIFIED in deployLog) && !skipVerify) {
      await verifyContractCode(hardhat, tokenPriceOracleTargetAddr, allConstructParams);
      deployLog[logName.DEPLOY_LOG_TOKEN_PRICE_ORACLE_TARGET_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }

    // verify proxy contract
    if (!(logName.DEPLOY_LOG_TOKEN_PRICE_ORACLE_PROXY_VERIFIED in deployLog) && !skipVerify) {
      await verifyContractCode(hardhat, tokenPriceOracleAddr, []);
      deployLog[logName.DEPLOY_LOG_TOKEN_PRICE_ORACLE_PROXY_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }
  });

task('upgradeTokenPriceOracle', 'Upgrade token price oracle')
  .addParam('skipVerify', 'Skip verify', false, types.boolean, true)
  .setAction(async (taskArgs, hardhat) => {
    let skipVerify = taskArgs.skipVerify;
    console.log('skipVerify', skipVerify);

    const chainInfo = zkLinkConfig[process.env.NET];
    if (chainInfo === undefined) {
      console.log('current net not support');
      return;
    }
    const pyth = chainInfo.pyth;
    if (pyth === undefined) {
      console.log('pyth address not exist');
      return;
    }
    console.log('pyth', pyth);

    const { deployLogPath, deployLog } = createOrGetDeployLog(logName.DEPLOY_TOKEN_PRICE_ORACLE_LOG_PREFIX);
    const contractAddr = deployLog[logName.DEPLOY_LOG_TOKEN_PRICE_ORACLE_PROXY];
    if (contractAddr === undefined) {
      console.log('token price oracle proxy address not exist');
      return;
    }
    console.log('token price oracle proxy', contractAddr);
    const oldContractTargetAddr = deployLog[logName.DEPLOY_LOG_TOKEN_PRICE_ORACLE_TARGET];
    if (oldContractTargetAddr === undefined) {
      console.log('token price oracle target address not exist');
      return;
    }
    console.log('token price oracle old target', oldContractTargetAddr);

    const contractDeployer = new ChainContractDeployer(hardhat);
    await contractDeployer.init();

    console.log('upgrade token price oracle...');
    const allConstructParams = [pyth];
    const contract = await contractDeployer.upgradeProxy('TokenPriceOracle', contractAddr, allConstructParams);
    const tx = await getDeployTx(contract);
    console.log('upgrade tx', tx.hash);
    const newContractTargetAddr = await getImplementationAddress(hardhat.ethers.provider, contractAddr);
    deployLog[logName.DEPLOY_LOG_TOKEN_PRICE_ORACLE_TARGET] = newContractTargetAddr;
    console.log('token price oracle new target', newContractTargetAddr);
    fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));

    if (!skipVerify) {
      await verifyContractCode(hardhat, newContractTargetAddr, allConstructParams);
      deployLog[logName.DEPLOY_LOG_TOKEN_PRICE_ORACLE_TARGET_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }
  });

task('deployTokenPriceOracleTarget', 'Deploy token price oracle target')
  .addParam('skipVerify', 'Skip verify', false, types.boolean, true)
  .setAction(async (taskArgs, hardhat) => {
    let skipVerify = taskArgs.skipVerify;
    console.log('skipVerify', skipVerify);

    const chainInfo = zkLinkConfig[process.env.NET];
    if (chainInfo === undefined) {
      console.log('current net not support');
      return;
    }
    const pyth = chainInfo.pyth;
    if (pyth === undefined) {
      console.log('pyth address not exist');
      return;
    }
    console.log('pyth', pyth);

    const { deployLogPath, deployLog } = createOrGetDeployLog(logName.DEPLOY_TOKEN_PRICE_ORACLE_LOG_PREFIX);

    const contractDeployer = new ChainContractDeployer(hardhat);
    await contractDeployer.init();

    // deploy token price oracle target
    console.log('deploy token price oracle target...');
    const allConstructParams = [pyth];
    const contract = await contractDeployer.deployContract('TokenPriceOracle', allConstructParams);
    const tx = await getDeployTx(contract);
    console.log('deploy tx', tx.hash);
    const targetAddr = await contract.getAddress();
    deployLog[logName.DEPLOY_LOG_TOKEN_PRICE_ORACLE_TARGET] = targetAddr;
    console.log('token price oracle target', targetAddr);
    fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));

    if (!skipVerify) {
      await verifyContractCode(hardhat, targetAddr, allConstructParams);
      deployLog[logName.DEPLOY_LOG_TOKEN_PRICE_ORACLE_TARGET_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }
  });
