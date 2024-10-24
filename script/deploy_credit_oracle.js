const fs = require('fs');
const { getImplementationAddress } = require('@openzeppelin/upgrades-core');
const { applyL1ToL2Alias } = require('@eth-optimism/core-utils');
const {
  verifyContractCode,
  getDeployTx,
  createOrGetDeployLog,
  ChainContractDeployer,
  readDeployLogField,
} = require('./utils');
const logName = require('./deploy_log_name');
const { zkLinkConfig } = require('./zklink_config');
const { task, types } = require('hardhat/config');

task('deployCreditOracle', 'Deploy credit oracle')
  .addParam(
    'l1ERC20BridgeAlias',
    'The l1ERC20Bridge alias address (default get from deploy log)',
    undefined,
    types.string,
    true,
  )
  .addParam(
    'tokenPriceOracle',
    'The tokenPriceOracle address (default get from deploy log)',
    undefined,
    types.string,
    true,
  )
  .addParam('skipVerify', 'Skip verify', false, types.boolean, true)
  .setAction(async (taskArgs, hardhat) => {
    let l1ERC20BridgeAlias = taskArgs.l1ERC20BridgeAlias;
    if (l1ERC20BridgeAlias === undefined) {
      const l1ERC20Bridge = readDeployLogField(logName.DEPLOY_ERC20_BRIDGE_LOG_PREFIX, logName.DEPLOY_ERC20_BRIDGE);
      console.log('l1ERC20Bridge', l1ERC20Bridge);
      l1ERC20BridgeAlias = applyL1ToL2Alias(l1ERC20Bridge);
    }
    console.log('l1ERC20BridgeAlias', l1ERC20BridgeAlias);

    let tokenPriceOracle = taskArgs.tokenPriceOracle;
    if (tokenPriceOracle === undefined) {
      tokenPriceOracle = readDeployLogField(
        logName.DEPLOY_TOKEN_PRICE_ORACLE_LOG_PREFIX,
        logName.DEPLOY_LOG_TOKEN_PRICE_ORACLE_PROXY,
      );
    }
    console.log('tokenPriceOracle', tokenPriceOracle);
    const skipVerify = taskArgs.skipVerify;
    console.log('skip verify contracts?', skipVerify);

    const chainInfo = zkLinkConfig[process.env.NET];
    if (chainInfo === undefined) {
      console.log('current net not support');
      return;
    }

    const contractDeployer = new ChainContractDeployer(hardhat);
    await contractDeployer.init();
    const deployerWallet = contractDeployer.deployerWallet;
    const { deployLogPath, deployLog } = createOrGetDeployLog(logName.DEPLOY_TOKEN_PRICE_ORACLE_LOG_PREFIX);
    deployLog[logName.DEPLOY_LOG_GOVERNOR] = deployerWallet.address;
    fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));

    // deploy token price oracle
    const allConstructParams = [l1ERC20BridgeAlias, tokenPriceOracle];
    let proxyAddr;
    if (!(logName.DEPLOY_LOG_CREDIT_ORACLE_PROXY in deployLog)) {
      console.log('deploy credit oracle...');
      const contract = await contractDeployer.deployProxy('CreditOracle', [], allConstructParams);
      const transaction = await getDeployTx(contract);
      proxyAddr = await contract.getAddress();
      deployLog[logName.DEPLOY_LOG_CREDIT_ORACLE_PROXY] = proxyAddr;
      deployLog[logName.DEPLOY_LOG_DEPLOY_TX_HASH] = transaction.hash;
      deployLog[logName.DEPLOY_LOG_DEPLOY_BLOCK_NUMBER] = transaction.blockNumber;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    } else {
      proxyAddr = deployLog[logName.DEPLOY_LOG_CREDIT_ORACLE_PROXY];
    }
    console.log('credit oracle', proxyAddr);

    let targetAddr;
    if (!(logName.DEPLOY_LOG_CREDIT_ORACLE_TARGET in deployLog)) {
      console.log('get credit oracle target...');
      targetAddr = await getImplementationAddress(hardhat.ethers.provider, proxyAddr);
      deployLog[logName.DEPLOY_LOG_CREDIT_ORACLE_TARGET] = targetAddr;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    } else {
      targetAddr = deployLog[logName.DEPLOY_LOG_CREDIT_ORACLE_TARGET];
    }
    console.log('credit oracle target', targetAddr);

    // verify target contract
    if (!(logName.DEPLOY_LOG_CREDIT_ORACLE_TARGET_VERIFIED in deployLog) && !skipVerify) {
      await verifyContractCode(hardhat, targetAddr, allConstructParams);
      deployLog[logName.DEPLOY_LOG_CREDIT_ORACLE_TARGET_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }

    // verify proxy contract
    if (!(logName.DEPLOY_LOG_CREDIT_ORACLE_PROXY_VERIFIED in deployLog) && !skipVerify) {
      await verifyContractCode(hardhat, proxyAddr, []);
      deployLog[logName.DEPLOY_LOG_CREDIT_ORACLE_PROXY_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }
  });
