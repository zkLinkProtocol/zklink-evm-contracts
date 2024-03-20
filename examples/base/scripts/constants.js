// Testnet
const L1_TESTNET_CONTRACTS = {
  StateCommitmentChain: '0x0000000000000000000000000000000000000000',
  BondManager: '0x0000000000000000000000000000000000000000',
  CanonicalTransactionChain: '0x0000000000000000000000000000000000000000',
  AddressManager: '0x709c2B8ef4A9feFc629A8a2C1AF424Dc5BD6ad1B',
  L1CrossDomainMessenger: '0xC34855F4De64F1840e5686e64278da901e261f20',
  L1StandardBridge: '0xfd0Bf71F60660E2f608ed56e1659C450eB113120',
  OptimismPortal: '0x49f53e41452C74589E85cA1677426Ba426459e85',
  L2OutputOracle: '0x84457ca9D0163FbC4bbfe4Dfbb20ba46e48DF254',
};

// Mainnet
const L1_MAINNET_CONTRACTS = {
  StateCommitmentChain: '0x0000000000000000000000000000000000000000',
  BondManager: '0x0000000000000000000000000000000000000000',
  CanonicalTransactionChain: '0x0000000000000000000000000000000000000000',
  AddressManager: '0x8EfB6B5c4767B09Dc9AA6Af4eAA89F749522BaE2',
  L1CrossDomainMessenger: '0x866E82a600A1414e583f7F13623F1aC5d58b0Afa',
  L1StandardBridge: '0x3154Cf16ccdb4C6d922629664174b904d80F2C35',
  OptimismPortal: '0x49048044D57e1C92A77f79988d21Fa8fAF74E97e',
  L2OutputOracle: '0x56315b90c40730925ec5485cf004d835058518A0',
};

module.exports = {
  L1_TESTNET_CONTRACTS,
  L1_MAINNET_CONTRACTS,
};