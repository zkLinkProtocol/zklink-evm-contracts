require('@nomicfoundation/hardhat-toolbox');
require('./scripts/claimFailedDeposit');

const BaseConfig = require('../../hardhat.base.config');

module.exports = Object.assign({}, BaseConfig, {
  paths: {
    cache: '../../cache',
    artifacts: '../../artifacts',
  },
});
