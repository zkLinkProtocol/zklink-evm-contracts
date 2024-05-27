const { Contract, keccak256 } = require('ethers');
const { applyL1ToL2Alias } = require('@eth-optimism/core-utils');
const axios = require('axios');

class ScrollSDK {
  static SCROLL_CONTRACTS = {
    ETHEREUM: {
      L1ScrollMessenger: '0x6774Bcbd5ceCeF1336b5300fb5186a12DDD8b367',
      L1MessageQueue: '0x0d7E906BD9cAFa154b048cFa766Cc1E54E39AF9B',
      L2ScrollMessenger: '0x781e90f1c8Fc4611c9b7497C3B47F99Ef6969CbC',
    },
    SEPOLIA: {
      L1ScrollMessenger: '0x50c7d3e7f7c656493D1D76aaa1a836CedfCBB16A',
      L1MessageQueue: '0xF0B2293F5D834eAe920c6974D50957A1732de763',
      L2ScrollMessenger: '0xBa50f5340FB9F3Bd074bD638c9BE13eCB36E603d',
    },
  };

  static SCROLL_ABIS = {
    L1ScrollMessenger: [
      {
        inputs: [
          { internalType: 'address', name: '_counterpart', type: 'address' },
          { internalType: 'address', name: '_rollup', type: 'address' },
          { internalType: 'address', name: '_messageQueue', type: 'address' },
        ],
        stateMutability: 'nonpayable',
        type: 'constructor',
      },
      { inputs: [], name: 'ErrorZeroAddress', type: 'error' },
      {
        anonymous: false,
        inputs: [{ indexed: true, internalType: 'bytes32', name: 'messageHash', type: 'bytes32' }],
        name: 'FailedRelayedMessage',
        type: 'event',
      },
      {
        anonymous: false,
        inputs: [{ indexed: false, internalType: 'uint8', name: 'version', type: 'uint8' }],
        name: 'Initialized',
        type: 'event',
      },
      {
        anonymous: false,
        inputs: [
          { indexed: true, internalType: 'address', name: 'previousOwner', type: 'address' },
          { indexed: true, internalType: 'address', name: 'newOwner', type: 'address' },
        ],
        name: 'OwnershipTransferred',
        type: 'event',
      },
      {
        anonymous: false,
        inputs: [{ indexed: false, internalType: 'address', name: 'account', type: 'address' }],
        name: 'Paused',
        type: 'event',
      },
      {
        anonymous: false,
        inputs: [{ indexed: true, internalType: 'bytes32', name: 'messageHash', type: 'bytes32' }],
        name: 'RelayedMessage',
        type: 'event',
      },
      {
        anonymous: false,
        inputs: [
          { indexed: true, internalType: 'address', name: 'sender', type: 'address' },
          { indexed: true, internalType: 'address', name: 'target', type: 'address' },
          { indexed: false, internalType: 'uint256', name: 'value', type: 'uint256' },
          { indexed: false, internalType: 'uint256', name: 'messageNonce', type: 'uint256' },
          { indexed: false, internalType: 'uint256', name: 'gasLimit', type: 'uint256' },
          { indexed: false, internalType: 'bytes', name: 'message', type: 'bytes' },
        ],
        name: 'SentMessage',
        type: 'event',
      },
      {
        anonymous: false,
        inputs: [{ indexed: false, internalType: 'address', name: 'account', type: 'address' }],
        name: 'Unpaused',
        type: 'event',
      },
      {
        anonymous: false,
        inputs: [
          { indexed: false, internalType: 'address', name: '_oldFeeVault', type: 'address' },
          { indexed: false, internalType: 'address', name: '_newFeeVault', type: 'address' },
        ],
        name: 'UpdateFeeVault',
        type: 'event',
      },
      {
        anonymous: false,
        inputs: [
          { indexed: false, internalType: 'uint256', name: 'oldMaxReplayTimes', type: 'uint256' },
          { indexed: false, internalType: 'uint256', name: 'newMaxReplayTimes', type: 'uint256' },
        ],
        name: 'UpdateMaxReplayTimes',
        type: 'event',
      },
      {
        inputs: [],
        name: 'counterpart',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [
          { internalType: 'address', name: '_from', type: 'address' },
          { internalType: 'address', name: '_to', type: 'address' },
          { internalType: 'uint256', name: '_value', type: 'uint256' },
          { internalType: 'uint256', name: '_messageNonce', type: 'uint256' },
          { internalType: 'bytes', name: '_message', type: 'bytes' },
        ],
        name: 'dropMessage',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
      {
        inputs: [],
        name: 'feeVault',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [
          { internalType: 'address', name: '_counterpart', type: 'address' },
          { internalType: 'address', name: '_feeVault', type: 'address' },
          { internalType: 'address', name: '_rollup', type: 'address' },
          { internalType: 'address', name: '_messageQueue', type: 'address' },
        ],
        name: 'initialize',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
        name: 'isL1MessageDropped',
        outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
        name: 'isL2MessageExecuted',
        outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [],
        name: 'maxReplayTimes',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [],
        name: 'messageQueue',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
        name: 'messageSendTimestamp',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [],
        name: 'owner',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [],
        name: 'paused',
        outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        name: 'prevReplayIndex',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [
          { internalType: 'address', name: '_from', type: 'address' },
          { internalType: 'address', name: '_to', type: 'address' },
          { internalType: 'uint256', name: '_value', type: 'uint256' },
          { internalType: 'uint256', name: '_nonce', type: 'uint256' },
          { internalType: 'bytes', name: '_message', type: 'bytes' },
          {
            components: [
              { internalType: 'uint256', name: 'batchIndex', type: 'uint256' },
              { internalType: 'bytes', name: 'merkleProof', type: 'bytes' },
            ],
            internalType: 'struct IL1ScrollMessenger.L2MessageProof',
            name: '_proof',
            type: 'tuple',
          },
        ],
        name: 'relayMessageWithProof',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
      { inputs: [], name: 'renounceOwnership', outputs: [], stateMutability: 'nonpayable', type: 'function' },
      {
        inputs: [
          { internalType: 'address', name: '_from', type: 'address' },
          { internalType: 'address', name: '_to', type: 'address' },
          { internalType: 'uint256', name: '_value', type: 'uint256' },
          { internalType: 'uint256', name: '_messageNonce', type: 'uint256' },
          { internalType: 'bytes', name: '_message', type: 'bytes' },
          { internalType: 'uint32', name: '_newGasLimit', type: 'uint32' },
          { internalType: 'address', name: '_refundAddress', type: 'address' },
        ],
        name: 'replayMessage',
        outputs: [],
        stateMutability: 'payable',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
        name: 'replayStates',
        outputs: [
          { internalType: 'uint128', name: 'times', type: 'uint128' },
          { internalType: 'uint128', name: 'lastIndex', type: 'uint128' },
        ],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [],
        name: 'rollup',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [
          { internalType: 'address', name: '_to', type: 'address' },
          { internalType: 'uint256', name: '_value', type: 'uint256' },
          { internalType: 'bytes', name: '_message', type: 'bytes' },
          { internalType: 'uint256', name: '_gasLimit', type: 'uint256' },
          { internalType: 'address', name: '_refundAddress', type: 'address' },
        ],
        name: 'sendMessage',
        outputs: [],
        stateMutability: 'payable',
        type: 'function',
      },
      {
        inputs: [
          { internalType: 'address', name: '_to', type: 'address' },
          { internalType: 'uint256', name: '_value', type: 'uint256' },
          { internalType: 'bytes', name: '_message', type: 'bytes' },
          { internalType: 'uint256', name: '_gasLimit', type: 'uint256' },
        ],
        name: 'sendMessage',
        outputs: [],
        stateMutability: 'payable',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'bool', name: '_status', type: 'bool' }],
        name: 'setPause',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'address', name: 'newOwner', type: 'address' }],
        name: 'transferOwnership',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'address', name: '_newFeeVault', type: 'address' }],
        name: 'updateFeeVault',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'uint256', name: '_newMaxReplayTimes', type: 'uint256' }],
        name: 'updateMaxReplayTimes',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
      {
        inputs: [],
        name: 'xDomainMessageSender',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
      },
      { stateMutability: 'payable', type: 'receive' },
    ],
    L1MessageQueue: [
      {
        inputs: [
          { internalType: 'address', name: '_messenger', type: 'address' },
          { internalType: 'address', name: '_scrollChain', type: 'address' },
          { internalType: 'address', name: '_enforcedTxGateway', type: 'address' },
        ],
        stateMutability: 'nonpayable',
        type: 'constructor',
      },
      { inputs: [], name: 'ErrorNotWhitelistedSender', type: 'error' },
      { inputs: [], name: 'ErrorZeroAddress', type: 'error' },
      {
        anonymous: false,
        inputs: [
          { indexed: false, internalType: 'uint256', name: 'startIndex', type: 'uint256' },
          { indexed: false, internalType: 'uint256', name: 'count', type: 'uint256' },
          { indexed: false, internalType: 'uint256', name: 'skippedBitmap', type: 'uint256' },
        ],
        name: 'DequeueTransaction',
        type: 'event',
      },
      {
        anonymous: false,
        inputs: [{ indexed: false, internalType: 'uint256', name: 'index', type: 'uint256' }],
        name: 'DropTransaction',
        type: 'event',
      },
      {
        anonymous: false,
        inputs: [{ indexed: false, internalType: 'uint8', name: 'version', type: 'uint8' }],
        name: 'Initialized',
        type: 'event',
      },
      {
        anonymous: false,
        inputs: [
          { indexed: true, internalType: 'address', name: 'previousOwner', type: 'address' },
          { indexed: true, internalType: 'address', name: 'newOwner', type: 'address' },
        ],
        name: 'OwnershipTransferred',
        type: 'event',
      },
      {
        anonymous: false,
        inputs: [
          { indexed: true, internalType: 'address', name: 'sender', type: 'address' },
          { indexed: true, internalType: 'address', name: 'target', type: 'address' },
          { indexed: false, internalType: 'uint256', name: 'value', type: 'uint256' },
          { indexed: false, internalType: 'uint64', name: 'queueIndex', type: 'uint64' },
          { indexed: false, internalType: 'uint256', name: 'gasLimit', type: 'uint256' },
          { indexed: false, internalType: 'bytes', name: 'data', type: 'bytes' },
        ],
        name: 'QueueTransaction',
        type: 'event',
      },
      {
        anonymous: false,
        inputs: [
          { indexed: true, internalType: 'address', name: '_oldGasOracle', type: 'address' },
          { indexed: true, internalType: 'address', name: '_newGasOracle', type: 'address' },
        ],
        name: 'UpdateGasOracle',
        type: 'event',
      },
      {
        anonymous: false,
        inputs: [
          { indexed: false, internalType: 'uint256', name: 'oldL2BaseFee', type: 'uint256' },
          { indexed: false, internalType: 'uint256', name: 'newL2BaseFee', type: 'uint256' },
        ],
        name: 'UpdateL2BaseFee',
        type: 'event',
      },
      {
        anonymous: false,
        inputs: [
          { indexed: false, internalType: 'uint256', name: '_oldMaxGasLimit', type: 'uint256' },
          { indexed: false, internalType: 'uint256', name: '_newMaxGasLimit', type: 'uint256' },
        ],
        name: 'UpdateMaxGasLimit',
        type: 'event',
      },
      {
        anonymous: false,
        inputs: [
          { indexed: true, internalType: 'address', name: '_oldWhitelistChecker', type: 'address' },
          { indexed: true, internalType: 'address', name: '_newWhitelistChecker', type: 'address' },
        ],
        name: 'UpdateWhitelistChecker',
        type: 'event',
      },
      {
        inputs: [
          { internalType: 'address', name: '_target', type: 'address' },
          { internalType: 'uint256', name: '_gasLimit', type: 'uint256' },
          { internalType: 'bytes', name: '_data', type: 'bytes' },
        ],
        name: 'appendCrossDomainMessage',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
      {
        inputs: [
          { internalType: 'address', name: '_sender', type: 'address' },
          { internalType: 'address', name: '_target', type: 'address' },
          { internalType: 'uint256', name: '_value', type: 'uint256' },
          { internalType: 'uint256', name: '_gasLimit', type: 'uint256' },
          { internalType: 'bytes', name: '_data', type: 'bytes' },
        ],
        name: 'appendEnforcedTransaction',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'bytes', name: '_calldata', type: 'bytes' }],
        name: 'calculateIntrinsicGasFee',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'pure',
        type: 'function',
      },
      {
        inputs: [
          { internalType: 'address', name: '_sender', type: 'address' },
          { internalType: 'uint256', name: '_queueIndex', type: 'uint256' },
          { internalType: 'uint256', name: '_value', type: 'uint256' },
          { internalType: 'address', name: '_target', type: 'address' },
          { internalType: 'uint256', name: '_gasLimit', type: 'uint256' },
          { internalType: 'bytes', name: '_data', type: 'bytes' },
        ],
        name: 'computeTransactionHash',
        outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
        stateMutability: 'pure',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'uint256', name: '_index', type: 'uint256' }],
        name: 'dropCrossDomainMessage',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
      {
        inputs: [],
        name: 'enforcedTxGateway',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'uint256', name: '_gasLimit', type: 'uint256' }],
        name: 'estimateCrossDomainMessageFee',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [],
        name: 'gasOracle',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'uint256', name: '_queueIndex', type: 'uint256' }],
        name: 'getCrossDomainMessage',
        outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [
          { internalType: 'address', name: '_messenger', type: 'address' },
          { internalType: 'address', name: '_scrollChain', type: 'address' },
          { internalType: 'address', name: '_enforcedTxGateway', type: 'address' },
          { internalType: 'address', name: '_gasOracle', type: 'address' },
          { internalType: 'uint256', name: '_maxGasLimit', type: 'uint256' },
        ],
        name: 'initialize',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
      { inputs: [], name: 'initializeV2', outputs: [], stateMutability: 'nonpayable', type: 'function' },
      {
        inputs: [{ internalType: 'uint256', name: '_queueIndex', type: 'uint256' }],
        name: 'isMessageDropped',
        outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'uint256', name: '_queueIndex', type: 'uint256' }],
        name: 'isMessageSkipped',
        outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [],
        name: 'l2BaseFee',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [],
        name: 'maxGasLimit',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        name: 'messageQueue',
        outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [],
        name: 'messenger',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [],
        name: 'nextCrossDomainMessageIndex',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [],
        name: 'owner',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [],
        name: 'pendingQueueIndex',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [
          { internalType: 'uint256', name: '_startIndex', type: 'uint256' },
          { internalType: 'uint256', name: '_count', type: 'uint256' },
          { internalType: 'uint256', name: '_skippedBitmap', type: 'uint256' },
        ],
        name: 'popCrossDomainMessage',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
      { inputs: [], name: 'renounceOwnership', outputs: [], stateMutability: 'nonpayable', type: 'function' },
      {
        inputs: [],
        name: 'scrollChain',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'uint256', name: '_newL2BaseFee', type: 'uint256' }],
        name: 'setL2BaseFee',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'address', name: 'newOwner', type: 'address' }],
        name: 'transferOwnership',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'address', name: '_newGasOracle', type: 'address' }],
        name: 'updateGasOracle',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'uint256', name: '_newMaxGasLimit', type: 'uint256' }],
        name: 'updateMaxGasLimit',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'address', name: '_newWhitelistChecker', type: 'address' }],
        name: 'updateWhitelistChecker',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
      {
        inputs: [],
        name: 'whitelistChecker',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
      },
    ],
    L2ScrollMessenger: [
      {
        inputs: [
          { internalType: 'address', name: '_counterpart', type: 'address' },
          { internalType: 'address', name: '_messageQueue', type: 'address' },
        ],
        stateMutability: 'nonpayable',
        type: 'constructor',
      },
      { inputs: [], name: 'ErrorZeroAddress', type: 'error' },
      {
        anonymous: false,
        inputs: [{ indexed: true, internalType: 'bytes32', name: 'messageHash', type: 'bytes32' }],
        name: 'FailedRelayedMessage',
        type: 'event',
      },
      {
        anonymous: false,
        inputs: [{ indexed: false, internalType: 'uint8', name: 'version', type: 'uint8' }],
        name: 'Initialized',
        type: 'event',
      },
      {
        anonymous: false,
        inputs: [
          { indexed: true, internalType: 'address', name: 'previousOwner', type: 'address' },
          { indexed: true, internalType: 'address', name: 'newOwner', type: 'address' },
        ],
        name: 'OwnershipTransferred',
        type: 'event',
      },
      {
        anonymous: false,
        inputs: [{ indexed: false, internalType: 'address', name: 'account', type: 'address' }],
        name: 'Paused',
        type: 'event',
      },
      {
        anonymous: false,
        inputs: [{ indexed: true, internalType: 'bytes32', name: 'messageHash', type: 'bytes32' }],
        name: 'RelayedMessage',
        type: 'event',
      },
      {
        anonymous: false,
        inputs: [
          { indexed: true, internalType: 'address', name: 'sender', type: 'address' },
          { indexed: true, internalType: 'address', name: 'target', type: 'address' },
          { indexed: false, internalType: 'uint256', name: 'value', type: 'uint256' },
          { indexed: false, internalType: 'uint256', name: 'messageNonce', type: 'uint256' },
          { indexed: false, internalType: 'uint256', name: 'gasLimit', type: 'uint256' },
          { indexed: false, internalType: 'bytes', name: 'message', type: 'bytes' },
        ],
        name: 'SentMessage',
        type: 'event',
      },
      {
        anonymous: false,
        inputs: [{ indexed: false, internalType: 'address', name: 'account', type: 'address' }],
        name: 'Unpaused',
        type: 'event',
      },
      {
        anonymous: false,
        inputs: [
          { indexed: false, internalType: 'address', name: '_oldFeeVault', type: 'address' },
          { indexed: false, internalType: 'address', name: '_newFeeVault', type: 'address' },
        ],
        name: 'UpdateFeeVault',
        type: 'event',
      },
      {
        anonymous: false,
        inputs: [
          { indexed: false, internalType: 'uint256', name: 'oldMaxFailedExecutionTimes', type: 'uint256' },
          { indexed: false, internalType: 'uint256', name: 'newMaxFailedExecutionTimes', type: 'uint256' },
        ],
        name: 'UpdateMaxFailedExecutionTimes',
        type: 'event',
      },
      {
        inputs: [],
        name: 'counterpart',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [],
        name: 'feeVault',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'address', name: '', type: 'address' }],
        name: 'initialize',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
        name: 'isL1MessageExecuted',
        outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [],
        name: 'messageQueue',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
        name: 'messageSendTimestamp',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [],
        name: 'owner',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [],
        name: 'paused',
        outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
        stateMutability: 'view',
        type: 'function',
      },
      {
        inputs: [
          { internalType: 'address', name: '_from', type: 'address' },
          { internalType: 'address', name: '_to', type: 'address' },
          { internalType: 'uint256', name: '_value', type: 'uint256' },
          { internalType: 'uint256', name: '_nonce', type: 'uint256' },
          { internalType: 'bytes', name: '_message', type: 'bytes' },
        ],
        name: 'relayMessage',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
      { inputs: [], name: 'renounceOwnership', outputs: [], stateMutability: 'nonpayable', type: 'function' },
      {
        inputs: [
          { internalType: 'address', name: '_to', type: 'address' },
          { internalType: 'uint256', name: '_value', type: 'uint256' },
          { internalType: 'bytes', name: '_message', type: 'bytes' },
          { internalType: 'uint256', name: '_gasLimit', type: 'uint256' },
          { internalType: 'address', name: '', type: 'address' },
        ],
        name: 'sendMessage',
        outputs: [],
        stateMutability: 'payable',
        type: 'function',
      },
      {
        inputs: [
          { internalType: 'address', name: '_to', type: 'address' },
          { internalType: 'uint256', name: '_value', type: 'uint256' },
          { internalType: 'bytes', name: '_message', type: 'bytes' },
          { internalType: 'uint256', name: '_gasLimit', type: 'uint256' },
        ],
        name: 'sendMessage',
        outputs: [],
        stateMutability: 'payable',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'bool', name: '_status', type: 'bool' }],
        name: 'setPause',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'address', name: 'newOwner', type: 'address' }],
        name: 'transferOwnership',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
      {
        inputs: [{ internalType: 'address', name: '_newFeeVault', type: 'address' }],
        name: 'updateFeeVault',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
      {
        inputs: [],
        name: 'xDomainMessageSender',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
      },
      { stateMutability: 'payable', type: 'receive' },
    ],
  };

  static CLAIM_INFO_URL = {
    ETHEREUM: 'https://mainnet-api-bridge-v2.scroll.io/api/txsbyhashes',
    SEPOLIA: 'https://sepolia-api-bridge-v2.scroll.io/api/txsbyhashes',
  };

  constructor(net, l1Provider, l2Provider) {
    this.net = net;
    this.l1Provider = l1Provider;
    this.l2Provider = l2Provider;
    this.l1ScrollMessenger = new Contract(
      ScrollSDK.SCROLL_CONTRACTS[net].L1ScrollMessenger,
      ScrollSDK.SCROLL_ABIS.L1ScrollMessenger,
      l1Provider,
    );
    this.l1MessageQueue = new Contract(
      ScrollSDK.SCROLL_CONTRACTS[net].L1MessageQueue,
      ScrollSDK.SCROLL_ABIS.L1MessageQueue,
      l1Provider,
    );
    this.l2ScrollMessenger = new Contract(
      ScrollSDK.SCROLL_CONTRACTS[net].L2ScrollMessenger,
      ScrollSDK.SCROLL_ABIS.L2ScrollMessenger,
      l2Provider,
    );
    this.claimUrl = ScrollSDK.CLAIM_INFO_URL[net];
  }

  async l2EstimateRelayMessageGasLimit(from, to, value, message) {
    const nonce = 0;
    const data = this.l2ScrollMessenger.interface.encodeFunctionData('relayMessage', [from, to, value, nonce, message]);
    const l1ScrollMessengerAlias = applyL1ToL2Alias(this.l1ScrollMessenger.target);
    return await this.l2Provider.estimateGas({
      from: l1ScrollMessengerAlias,
      to: this.l2ScrollMessenger.target,
      data,
    });
  }

  async l1ToL2GasValue(l2GasLimit) {
    return await this.l1MessageQueue.estimateCrossDomainMessageFee(l2GasLimit);
  }

  async getSentMessage(l1TxHash) {
    const l1TxReceipt = await this.l1Provider.getTransactionReceipt(l1TxHash);
    const sentMessageLog = l1TxReceipt.logs
      .map(log => this.l1ScrollMessenger.interface.parseLog(log))
      .filter(log => log && log.name === 'SentMessage')
      .pop();
    return {
      sender: sentMessageLog.args[0],
      target: sentMessageLog.args[1],
      value: sentMessageLog.args[2],
      messageNonce: sentMessageLog.args[3],
      gasLimit: sentMessageLog.args[4],
      message: sentMessageLog.args[5],
    };
  }

  xDomainCalldataHash(sender, target, value, messageNonce, message) {
    const data = this.l2ScrollMessenger.interface.encodeFunctionData('relayMessage', [
      sender,
      target,
      value,
      messageNonce,
      message,
    ]);
    return keccak256(data);
  }

  async getL2TxReceipt(xDomainHash, fromBlock, toBlock) {
    const relayedMessageEvent = (
      await this.l2ScrollMessenger.queryFilter(
        this.l2ScrollMessenger.filters.RelayedMessage(xDomainHash),
        fromBlock,
        toBlock,
      )
    ).pop();
    return await relayedMessageEvent.getTransactionReceipt();
  }

  async getL2ToL1TxClaimInfo(l2TxHash) {
    const responseData = await axios
      .post(
        this.claimUrl,
        {
          txs: [l2TxHash],
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      )
      .then(response => {
        return response.data;
      });
    if (responseData.data && responseData.data.results && responseData.data.results.length > 0) {
      const result = responseData.data.results[0];
      // claim_info is null if l2 hash is not claimable
      return result.claim_info;
    }
    throw new Error('No claim info');
  }

  async claimL2Tx(claimInfo, l1Wallet) {
    return await this.l1ScrollMessenger
      .connect(l1Wallet)
      .relayMessageWithProof(claimInfo.from, claimInfo.to, claimInfo.value, claimInfo.nonce, claimInfo.message, [
        claimInfo.proof.batch_index,
        claimInfo.proof.merkle_proof,
      ]);
  }
}

module.exports = {
  ScrollSDK,
};
