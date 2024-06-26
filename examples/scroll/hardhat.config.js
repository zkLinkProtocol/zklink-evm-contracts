require('@nomicfoundation/hardhat-toolbox');
require('./scripts/syncL2Requests');
require('./scripts/syncBatchRoot');
require('./scripts/setValidator');
require('./scripts/changeFeeParams');
require('./scripts/checkTxStatus');

const BaseConfig = require('../../hardhat.base.config');

BigInt.prototype.toJSON = function () {
  return this.toString();
};

module.exports = Object.assign({}, BaseConfig, {
  paths: {
    cache: '../../cache',
    artifacts: '../../artifacts',
  },
});
