const fs = require('fs');
const {
  verifyContractCode,
  createOrGetDeployLog,
  ChainContractDeployer,
  getDeployTx,
  readDeployContract,
} = require('./utils');
const logName = require('./deploy_log_name');
const { task, types } = require('hardhat/config');

task('deployGovernance', 'Deploy governance')
  .addParam('admin', 'The admin address (default is the deployer)', undefined, types.string, true)
  .addParam(
    'securityCouncil',
    'The security council address (default is the zero address)',
    '0x0000000000000000000000000000000000000000',
    types.string,
    true,
  )
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

task('encodeUUPSUpgradeCalldata', 'Encode calldata for uups upgrade')
  .addParam('newImplementation', 'The new implementation', undefined, types.string, false)
  .setAction(async (taskArgs, hardhat) => {
    let newImplementation = taskArgs.newImplementation;
    console.log('new implementation', newImplementation);

    const contractFactory = await hardhat.ethers.getContractAt(
      'UUPSUpgradeable',
      '0x0000000000000000000000000000000000000000',
    );
    const upgradeToCalldata = contractFactory.interface.encodeFunctionData('upgradeTo', [newImplementation]);
    console.log('upgradeTo calldata', upgradeToCalldata);
  });

task('encodeERC20Approve', 'Encode calldata for erc20 approve')
  .addParam('spender', 'The spender address', undefined, types.string, false)
  .addParam(
    'amount',
    'The approve amount',
    '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    types.string,
    true,
  )
  .setAction(async (taskArgs, hardhat) => {
    let spender = taskArgs.spender;
    let amount = taskArgs.amount;
    console.log('spender', spender);
    console.log('approve amount', amount);

    const contractFactory = await hardhat.ethers.getContractAt('IERC20', '0x0000000000000000000000000000000000000000');
    const approveCalldata = contractFactory.interface.encodeFunctionData('approve', [spender, amount]);
    console.log('approve calldata', approveCalldata);
  });

task('encodeOperation', 'Encode operation')
  .addParam('target', 'The target address', undefined, types.string, false)
  .addParam('value', 'The call value to target', undefined, types.int, false)
  .addParam('data', 'The call data to target', undefined, types.string, false)
  .addParam(
    'predecessor',
    'The predecessor of operation',
    '0x0000000000000000000000000000000000000000000000000000000000000000',
    types.string,
    true,
  )
  .addParam(
    'salt',
    'The salt of operation',
    '0x0000000000000000000000000000000000000000000000000000000000000000',
    types.string,
    true,
  )
  .addParam('delay', 'The delay', 0, types.int, true)
  .setAction(async (taskArgs, hardhat) => {
    let target = taskArgs.target;
    let value = taskArgs.value;
    let data = taskArgs.data;
    let predecessor = taskArgs.predecessor;
    let salt = taskArgs.salt;
    let delay = taskArgs.delay;
    console.log('target', target);
    console.log('value', value);
    console.log('data', data);
    console.log('predecessor', predecessor);
    console.log('salt', salt);
    console.log('delay', delay);

    const governanceAddr = readDeployContract(logName.DEPLOY_GOVERNANCE_LOG_PREFIX, logName.DEPLOY_LOG_GOVERNANCE);
    if (!governanceAddr) {
      console.log('governance address not found');
      return;
    }
    console.log('governance', governanceAddr);
    const governance = await hardhat.ethers.getContractAt('Governance', governanceAddr);
    if (value > 0) {
      const governanceBalance = await hardhat.ethers.provider.getBalance(governanceAddr);
      console.log('governance balance', governanceBalance);
      if (governanceBalance < value) {
        console.log('insufficient balance for execute transaction, please transfer some eth to governance');
        return;
      }
    }

    const call = {
      target,
      value,
      data,
    };
    const operation = {
      calls: [call],
      predecessor: predecessor,
      salt: salt,
    };

    const scheduleTransparentCalldata = governance.interface.encodeFunctionData('scheduleTransparent', [
      operation,
      delay,
    ]);
    console.log('scheduleTransparentCalldata', scheduleTransparentCalldata);

    const executeCalldata = governance.interface.encodeFunctionData('execute', [operation]);
    console.log('executeCalldata', executeCalldata);
  });
