require('@nomiclabs/hardhat-ethers');
require('./scripts/syncL2Requests');
require('./scripts/syncBatchRoot');
require('./scripts/changeFeeParams');
require('./scripts/setValidator');
require('./scripts/setSecondaryGateway');
require('./scripts/governance');

const BaseConfig = require('../../hardhat.base.config');

module.exports = Object.assign({}, BaseConfig, {
  paths: {
    cache: '../../cache',
    artifacts: '../../artifacts',
  },
});
