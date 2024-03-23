const fs = require('fs');
const { verifyContractCode, createOrGetDeployLog, ChainContractDeployer, getDeployTx } = require('./utils');
const logName = require('./deploy_log_name');
const { task, types } = require('hardhat/config');

task('deployGovernance', 'Deploy governance')
  .addParam('admin', 'The admin address (default is the deployer)', undefined, types.string, true)
  .addParam('securityCouncil', 'The security council address (default is the zero address)', "0x0000000000000000000000000000000000000000", types.string, true)
  .addParam('minDelay', 'The initial minimum delay (in seconds) to be set for operations', 0, types.int, true)
  .addParam('skipVerify', 'Skip verify', false, types.boolean, true)
  .setAction(async (taskArgs, hardhat) => {
    const contractDeployer = new ChainContractDeployer(hardhat);
    await contractDeployer.init();
    const deployerWallet = contractDeployer.deployerWallet;

    let adminAddr = taskArgs.admin;
    if (adminAddr === undefined) {
      adminAddr = deployerWallet.address;
    }
    let securityCouncilAddr = taskArgs.securityCouncil;
    let minDelay = taskArgs.minDelay;
    let skipVerify = taskArgs.skipVerify;
    console.log('admin', adminAddr);
    console.log('securityCouncil', securityCouncilAddr);
    console.log('minDelay', minDelay);
    console.log('skip verify contracts?', skipVerify);

    const { deployLogPath, deployLog } = createOrGetDeployLog(logName.DEPLOY_GOVERNANCE_LOG_PREFIX);
    deployLog[logName.DEPLOY_LOG_DEPLOYER] = deployerWallet.address;
    fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));

    // deploy governance
    let governanceAddr;
    const allConstructParams = [adminAddr, securityCouncilAddr, minDelay];
    if (!(logName.DEPLOY_LOG_GOVERNANCE in deployLog)) {
      console.log('deploy governance...');
      const contract = await contractDeployer.deployContract('Governance', allConstructParams);
      const transaction = await getDeployTx(contract);
      governanceAddr = await contract.getAddress();
      deployLog[logName.DEPLOY_LOG_GOVERNANCE] = governanceAddr;
      deployLog[logName.DEPLOY_LOG_DEPLOY_TX_HASH] = transaction.hash;
      deployLog[logName.DEPLOY_LOG_DEPLOY_BLOCK_NUMBER] = transaction.blockNumber;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    } else {
      governanceAddr = deployLog[logName.DEPLOY_LOG_GOVERNANCE];
    }
    console.log('governance', governanceAddr);

    // verify governance
    if (!(logName.DEPLOY_LOG_GOVERNANCE_VERIFIED in deployLog) && !skipVerify) {
      await verifyContractCode(hardhat, governanceAddr, allConstructParams);
      deployLog[logName.DEPLOY_LOG_GOVERNANCE_VERIFIED] = true;
      fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
    }
  });

task('encodeUUPSUpgradeOperation', 'Encode operation for uups upgrade')
  .addParam('proxy', 'The proxy', undefined, types.string, false)
  .addParam('newImplementation', 'The new implementation', undefined, types.string, false)
  .addParam('predecessor', 'The predecessor of operation', "0x0000000000000000000000000000000000000000000000000000000000000000", types.string, true)
  .addParam('salt', 'The salt of operation', "0x0000000000000000000000000000000000000000000000000000000000000000", types.string, true)
  .addParam('delay', 'The delay', 0, types.int, true)
  .setAction(async (taskArgs, hardhat) => {
    let proxy = taskArgs.proxy;
    let newImplementation = taskArgs.newImplementation;
    let predecessor = taskArgs.predecessor;
    let salt = taskArgs.salt;
    let delay = taskArgs.delay;
    console.log('proxy', proxy);
    console.log('new implementation', newImplementation);
    console.log('predecessor', predecessor);
    console.log('salt', salt);
    console.log('delay', delay);

    const contractFactory = await hardhat.ethers.getContractAt('UUPSUpgradeable', "0x0000000000000000000000000000000000000000");
    const upgradeToCalldata = contractFactory.interface.encodeFunctionData('upgradeTo', [newImplementation]);
    console.log('upgradeTo calldata', upgradeToCalldata);
    const call = {
      target: proxy,
      value: 0,
      data: upgradeToCalldata
    };
    const operation = {
      calls: [call],
      predecessor: predecessor,
      salt: salt
    }

    const governanceFactory = await hardhat.ethers.getContractFactory('Governance');
    const scheduleTransparentCalldata = governanceFactory.interface.encodeFunctionData('scheduleTransparent', [operation, 0]);
    console.log('scheduleTransparentCalldata', scheduleTransparentCalldata);

    const executeCalldata = governanceFactory.interface.encodeFunctionData('execute', [operation]);
    console.log('executeCalldata', executeCalldata);
  });