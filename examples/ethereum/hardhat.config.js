require('@nomicfoundation/hardhat-toolbox');
require('./scripts/changeFeeParams');
require('./scripts/setValidator');

const BaseConfig = require('../../hardhat.base.config');

module.exports = Object.assign({}, BaseConfig, {
  paths: {
    cache: '../../cache',
    artifacts: '../../artifacts',
  },
});
