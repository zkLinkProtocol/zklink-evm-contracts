const scrollContractABIs = require('./ContractABIs.json');

async function getL1MessagerContract(hre, wallet) {
  const abi = scrollContractABIs['L1ScrollMessenger'];
  const l1MessagerAddress = '0x50c7d3e7f7c656493D1D76aaa1a836CedfCBB16A';
  const l1Messager = await hre.ethers.getContractAt(abi, l1MessagerAddress, wallet);
  return { l1Messager };
}

async function estimateGas(gasLimit, wallet, hre) {
  const abi = scrollContractABIs['L1MessageQueueWithGasPriceOracle'];
  const L1MessageQueueWithGasPriceOracleAddress = '0xF0B2293F5D834eAe920c6974D50957A1732de763';
  const l1MessageQueueWithGasPriceOracle = await hre.ethers.getContractAt(
    abi,
    L1MessageQueueWithGasPriceOracleAddress,
    wallet,
  );

  const gasValue = await l1MessageQueueWithGasPriceOracle.estimateCrossDomainMessageFee(gasLimit);
  return { gasValue };
}

module.exports = {
  getL1MessagerContract,
  estimateGas,
};
