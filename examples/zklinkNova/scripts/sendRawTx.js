const { ethers } = require('ethers');
const { task, types } = require('hardhat/config');

require('dotenv').config();

task('sendRawTx', 'Send raw tx to nova')
  .addParam('to', 'The to address', undefined, types.string)
  .addParam('data', 'The call data', undefined, types.string)
  .addOptionalParam('value', 'The call value(unit: ether)', '0', types.string)
  .addOptionalParam('gasPrice', 'The gas price(unit: gwei)', '0', types.string)
  .setAction(async taskArgs => {
    const to = taskArgs.to;
    const data = taskArgs.data;
    const value = ethers.parseEther(taskArgs.value);
    const gasPrice = ethers.parseUnits(taskArgs.gasPrice, 'gwei');

    const provider = new ethers.JsonRpcProvider(process.env.ZKLINK_NOVA_RPC);
    const wallet = new ethers.Wallet(process.env.DEVNET_PRIVKEY, provider);
    const tx = await wallet.sendTransaction({
      to,
      data,
      value,
      gasPrice,
    });
    console.log(`The tx hash: ${tx.hash}`);
    const txReceipt = await tx.wait(1);
    console.log(`The tx status: ${txReceipt.status}`);
  });
