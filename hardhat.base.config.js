/**
 * @type import('hardhat/config').HardhatUserConfig
 */
const hardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: '0.8.18',
        settings: {
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
  },
  gasReporter: {
    enabled: !!process.env.REPORT_GAS,
  },
  mocha: {
    timeout: 600000,
  },
};

// custom hardhat user config for different net
if (process.env.NET !== undefined) {
  const netName = process.env.NET;
  hardhatUserConfig.defaultNetwork = netName;

  const netConfig = require(`./etc/${netName}.json`);
  hardhatUserConfig.networks[netName] = netConfig.network;

  // config contract verify key if exist
  if (netConfig.etherscan !== undefined) {
    hardhatUserConfig.etherscan = netConfig.etherscan;
  }
}

module.exports = hardhatUserConfig;
