const { ethers } = require('ethers');
const { task, types } = require('hardhat/config');

task('printSetValidator', 'Print the operation data of setValidator')
  .addParam('zkLink', 'The zkLink address', undefined, types.string)
  .addParam('validator', 'The validator address', undefined, types.string)
  .addOptionalParam('active', 'The validator active status', true, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const targetAddress = taskArgs.zkLink;
    const validatorAddress = taskArgs.validator;
    const active = taskArgs.active;
    const zkLink = await hre.ethers.getContractFactory('ZkLink');
    const callData = zkLink.interface.encodeFunctionData('setValidator', [validatorAddress, active]);
    const governance = await hre.ethers.getContractFactory('Governance');
    printOperation(governance, targetAddress, 0, callData);
  });

function printOperation(governance, targetAddress, value, callData) {
  const operation = {
    calls: [{ target: targetAddress, value: value, data: callData }],
    predecessor: ethers.ZeroHash,
    salt: ethers.hexlify(ethers.randomBytes(32)),
  };
  console.log('Operation:', operation);
  console.log('Schedule operation: ', governance.interface.encodeFunctionData('scheduleTransparent', [operation, 0]));
  console.log(
    `Execute operation value: ${value}, calldata`,
    governance.interface.encodeFunctionData('execute', [operation]),
  );
}
