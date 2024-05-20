const { task, types } = require('hardhat/config');
const { claimL1ToL2Message } = require('./common');

require('dotenv').config();

task('claimL1Tx', 'Claim l1 tx')
  .addParam('txHash', 'The l2 to l1 tx hash', undefined, types.string)
  .addOptionalParam('index', 'The l2 to l1 message index', 0, types.int)
  .setAction(async taskArgs => {
    const l2ToL1TxHash = taskArgs.txHash;
    const messageIndex = taskArgs.index;
    console.log(`The l2 to l1 tx hash: ${l2ToL1TxHash}`);
    console.log(`The message index: ${messageIndex}`);

    await claimL1ToL2Message(l2ToL1TxHash, messageIndex);
  });
