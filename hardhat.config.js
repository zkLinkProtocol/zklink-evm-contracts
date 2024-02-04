require('@nomicfoundation/hardhat-toolbox');
require('@openzeppelin/hardhat-upgrades');
require('./script/deploy_zklink');
require('./script/deploy_arbitrator');
require('./script/deploy_l1_gateway');
require('./script/deploy_l2_gateway');
require('./script/deploy_eth_gateway');

const BaseConfig = require('./hardhat.base.config');

module.exports = Object.assign({}, BaseConfig, {});
