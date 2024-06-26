require('@nomicfoundation/hardhat-toolbox');
require('./scripts/syncL2Requests');
require('./scripts/syncBatchRoot');
require('./scripts/setValidator');
require('./scripts/changeFeeParams');
require('./scripts/setSecondaryGateway');
require('./scripts/governance');
require('./scripts/claimL1Tx');

const BaseConfig = require('../../hardhat.base.config');

module.exports = Object.assign({}, BaseConfig, {
  paths: {
    cache: '../../cache',
    artifacts: '../../artifacts',
  },
});
