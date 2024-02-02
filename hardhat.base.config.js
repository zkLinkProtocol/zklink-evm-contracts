require("./script/deploy_zklink");
require("./script/deploy_l1_gateway");
require("./script/deploy_l2_gateway");

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
const hardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.18",
        settings: {
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      }
    ]
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

module.exports = hardhatUserConfig;
