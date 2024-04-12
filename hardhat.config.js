require('@nomicfoundation/hardhat-toolbox');
require('@openzeppelin/hardhat-upgrades');
require('./script/deploy_zklink');
require('./script/deploy_arbitrator');
require('./script/deploy_l1_gateway');
require('./script/deploy_l2_gateway');
require('./script/deploy_eth_gateway');
require('./script/deploy_erc20_bridge');
require('./script/deploy_governance');
require('./script/deploy_linea_l2_governance');
require('./script/deploy_zklink_token');

const BaseConfig = require('./hardhat.base.config');

module.exports = Object.assign({}, BaseConfig, {});
