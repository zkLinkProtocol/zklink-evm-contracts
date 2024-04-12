require('@nomicfoundation/hardhat-ethers');
require('@matterlabs/hardhat-zksync-deploy');
require('@matterlabs/hardhat-zksync-solc');
require('@matterlabs/hardhat-zksync-verify');
require('@matterlabs/hardhat-zksync-upgradable');
const { TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS } = require('hardhat/builtin-tasks/task-names');
const path = require('path');

const fs = require('fs');

if (!fs.existsSync('contracts')) {
  // create a soft link
  fs.symlinkSync('../contracts', 'contracts');
  console.log('Create contracts soft link success!');
}

if (!fs.existsSync('script')) {
  // create a soft link
  fs.symlinkSync('../script', 'script');
  console.log('Create script soft link success!');
}

require('./script/deploy_zklink');
require('./script/deploy_l2_gateway');
require('./script/deploy_erc20_bridge');

const BaseConfig = require('../hardhat.base.config');
const { subtask } = require('hardhat/config');
subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS, async (_, { config }, runSuper) => {
  const paths = await runSuper();

  return paths.filter(solidityFilePath => {
    const relativePath = path.relative(config.paths.sources, solidityFilePath);

    return relativePath !== 'Arbitrator.sol';
  });
});

module.exports = Object.assign({}, BaseConfig, {
  zksolc: {
    version: '1.3.22',
    settings: {},
  },
});
