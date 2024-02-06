const ZKSYNC_HOME = process.env.ZKSYNC_HOME;
if (ZKSYNC_HOME === undefined) {
  throw Error('ZKSYNC_HOME not config');
}

const SYSTEM_CONFIG_JSON = require(`${ZKSYNC_HOME}/contracts/SystemConfig.json`);

const SYSTEM_CONFIG = {
  requiredL2GasPricePerPubdata: SYSTEM_CONFIG_JSON.REQUIRED_L2_GAS_PRICE_PER_PUBDATA,
  priorityTxMinimalGasPrice: SYSTEM_CONFIG_JSON.PRIORITY_TX_MINIMAL_GAS_PRICE,
  priorityTxMaxGasPerBatch: SYSTEM_CONFIG_JSON.PRIORITY_TX_MAX_GAS_PER_BATCH,
  priorityTxPubdataPerBatch: SYSTEM_CONFIG_JSON.PRIORITY_TX_PUBDATA_PER_BATCH,
  priorityTxBatchOverheadL1Gas: SYSTEM_CONFIG_JSON.PRIORITY_TX_BATCH_OVERHEAD_L1_GAS,
  priorityTxMaxPubdata: SYSTEM_CONFIG_JSON.PRIORITY_TX_MAX_PUBDATA,
};

const INIT_FEE_PARAMS = {
  pubdataPricingMode: 0, // rollup
  batchOverheadL1Gas: SYSTEM_CONFIG.priorityTxBatchOverheadL1Gas,
  maxPubdataPerBatch: SYSTEM_CONFIG.priorityTxPubdataPerBatch,
  priorityTxMaxPubdata: SYSTEM_CONFIG.priorityTxMaxPubdata,
  maxL2GasPerBatch: SYSTEM_CONFIG.priorityTxMaxGasPerBatch,
  minimalL2GasPrice: SYSTEM_CONFIG.priorityTxMinimalGasPrice,
};

module.exports = {
  INIT_FEE_PARAMS,
};
