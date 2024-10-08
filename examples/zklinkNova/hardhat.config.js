require('@nomicfoundation/hardhat-toolbox');
require('./scripts/getTxStatus');
require('./scripts/decodeRawTx');
require('./scripts/printGovernanceCall');
require('./scripts/sendRawTx');

const BaseConfig = require('../../hardhat.base.config');

module.exports = Object.assign({}, BaseConfig, {
  paths: {
    cache: '../../cache',
    artifacts: '../../artifacts',
  },
});
