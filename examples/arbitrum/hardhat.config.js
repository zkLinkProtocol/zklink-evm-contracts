require('@nomiclabs/hardhat-ethers');
require('./scripts/syncL2Requests');
require('./scripts/syncBatchRoot');

const BaseConfig = require('../../hardhat.base.config');

module.exports = Object.assign({}, BaseConfig, {
  paths: {
    cache: '../../cache',
    artifacts: '../../artifacts',
  },
});
