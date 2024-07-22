const zksync = require('zksync-ethers');
const { recoverAddress } = require('ethers');
const { task, types } = require('hardhat/config');

task('decodeRawTx', 'Decode the raw tx of nova')
  .addParam('rawTx', 'The raw tx', undefined, types.string)
  .setAction(async taskArgs => {
    const rawTx = taskArgs.rawTx;
    const tx = zksync.types.Transaction.from(rawTx);
    console.log(JSON.stringify(tx.toJSON()));
    const from = recoverAddress(tx.unsignedHash, tx.signature);
    console.log(from);
  });
