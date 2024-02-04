require('@nomicfoundation/hardhat-ethers');
require('@matterlabs/hardhat-zksync-deploy');
require('@matterlabs/hardhat-zksync-solc');
require('@matterlabs/hardhat-zksync-verify');
require('@matterlabs/hardhat-zksync-upgradable');
const fs = require('fs');

if (!fs.existsSync('contracts')) {
  // create a soft link
  fs.symlinkSync('../contracts', 'contracts');
  console.log('Create contracts soft link success!');
}

if (!fs.existsSync('script')) {
  // create a soft link
  fs.symlinkSync('../script', 'script');
  console.log('Create script soft link success!');
}

const BaseConfig = require('../hardhat.base.config');

module.exports = Object.assign({}, BaseConfig, {
  zksolc: {
    version: '1.3.22',
    settings: {},
  },
});
