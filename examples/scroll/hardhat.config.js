require('@nomicfoundation/hardhat-toolbox');
require('./scripts/syncL2Requests');
require('./scripts/syncBatchRoot');
require('./scripts/setValidator');
require('./scripts/changeFeeParams');

const BaseConfig = require('../../hardhat.base.config');

module.exports = Object.assign({}, BaseConfig, {
  paths: {
    cache: '../../cache',
    artifacts: '../../artifacts',
  },
});
