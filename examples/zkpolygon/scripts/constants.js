const CROSS_CHAIN_MESSENGER_ABI = [
  {
    inputs: [
      { internalType: 'bytes32[32]', name: 'smtProof', type: 'bytes32[32]' },
      { internalType: 'uint32', name: 'index', type: 'uint32' },
      { internalType: 'bytes32', name: 'mainnetExitRoot', type: 'bytes32' },
      { internalType: 'bytes32', name: 'rollupExitRoot', type: 'bytes32' },
      { internalType: 'uint32', name: 'originNetwork', type: 'uint32' },
      { internalType: 'address', name: 'originAddress', type: 'address' },
      { internalType: 'uint32', name: 'destinationNetwork', type: 'uint32' },
      { internalType: 'address', name: 'destinationAddress', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
      { internalType: 'bytes', name: 'metadata', type: 'bytes' },
    ],
    name: 'claimMessage',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

const L1_CROSS_CHAIN_MESSENGER_ADDRESS = '0xF6BEEeBB578e214CA9E23B0e9683454Ff88Ed2A7';
const L2_CROSS_CHAIN_MESSENGER_ADDRESS = '0xF6BEEeBB578e214CA9E23B0e9683454Ff88Ed2A7';

module.exports = {
  CROSS_CHAIN_MESSENGER_ABI,
  L1_CROSS_CHAIN_MESSENGER_ADDRESS,
  L2_CROSS_CHAIN_MESSENGER_ADDRESS,
};
