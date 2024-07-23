require('@nomicfoundation/hardhat-toolbox');
require('./scripts/depositETH');
require('./scripts/depositERC20');
require('./scripts/requestL2Tx');

const BaseConfig = require('../../hardhat.base.config');

module.exports = Object.assign({}, BaseConfig, {
  paths: {
    cache: '../../cache',
    artifacts: '../../artifacts',
  },
});
