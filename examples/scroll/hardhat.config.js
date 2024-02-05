require('@nomiclabs/hardhat-ethers');
require('./scripts/1_initConfig');
require('./scripts/2_syncL2Requests');
require('./scripts/3_syncBatchRoot');

const BaseConfig = require('../../hardhat.base.config');

module.exports = Object.assign({}, BaseConfig, {
  paths: {
    cache: '../../cache',
    artifacts: '../../artifacts',
  },
});
