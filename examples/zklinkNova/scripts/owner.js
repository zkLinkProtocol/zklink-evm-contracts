const { Provider } = require('zksync-ethers');
const { ethers } = require('ethers');
const { task, types } = require('hardhat/config');

require('dotenv').config();

// EIP-1967 admin slot = bytes32(uint256(keccak256("eip1967.proxy.admin")) - 1)
const ADMIN_SLOT =
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";

// L2ERC20Bridge用的TransparentUpgradeableProxy的版本是4.9.5
task('getTransparentUpgradeableProxyAdmin', 'Get the admin of transparent upgradable proxy')
  .addParam('proxy', 'The address of proxy', undefined, types.string)
  .setAction(async taskArgs => {
    const proxy = taskArgs.proxy;
    console.log(`Get the admin of proxy: ${proxy}`);
    const zkLinkNovaProvider = new Provider(process.env.ZKLINK_NOVA_RPC);
    const raw = await zkLinkNovaProvider.getStorage(proxy, ADMIN_SLOT);
    // raw example: 0x000...<40 hex of address>
    const admin = slotToAddress(raw);
    console.log(`The admin is: ${admin}`);
  });

task('changeTransparentUpgradeableProxyAdmin', 'Change the admin of transparent upgradable proxy')
  .addParam('proxy', 'The address of proxy', undefined, types.string)
  .addParam('newAdmin', 'The new admin address', undefined, types.string)
  .setAction(async taskArgs => {
    const proxy = taskArgs.proxy;
    const newAdmin = taskArgs.newAdmin;
    console.log(`Change the admin of proxy: ${proxy} to new admin: ${newAdmin}`);
    const zkLinkNovaProvider = new Provider(process.env.ZKLINK_NOVA_RPC);
    const wallet = new ethers.Wallet(process.env.DEVNET_PRIVKEY, zkLinkNovaProvider);
    const beforeRaw = await zkLinkNovaProvider.getStorage(proxy, ADMIN_SLOT);
    console.log("Change admin(before): ", slotToAddress(beforeRaw));

    const PROXY_ABI = [
      "function changeAdmin(address newAdmin) external",
    ];
    const c = new ethers.Contract(proxy, PROXY_ABI, wallet);

    const tx = await c.changeAdmin(newAdmin);
    console.log("Change admin tx: ", tx.hash);
    await tx.wait();

    const afterRaw = await zkLinkNovaProvider.getStorage(proxy, ADMIN_SLOT);
    console.log("Change admin(after): ", slotToAddress(afterRaw));
  });

function slotToAddress(slotValueHex) {
  // slotValueHex is 32-byte hex string. Address is the low 20 bytes.
  return ethers.getAddress("0x" + slotValueHex.slice(-40));
}

task('getL2TokenBeaconOwner', 'Get the owner of l2 token beacon')
  .addParam('l2TokenBeacon', 'The address of l2 token beacon', undefined, types.string)
  .setAction(async taskArgs => {
    const l2TokenBeacon = taskArgs.l2TokenBeacon;
    console.log(`Get the owner of l2TokenBeacon: ${l2TokenBeacon}`);
    const zkLinkNovaProvider = new Provider(process.env.ZKLINK_NOVA_RPC);
    const abi = ["function owner() view returns (address)", "function implementation() view returns (address)"];
    const c = new ethers.Contract(l2TokenBeacon, abi, zkLinkNovaProvider);
    const owner = await c.owner();
    console.log(`The owner is: ${owner}`);

    const impl = await c.implementation();
    console.log(`The implementation is: ${impl}`);
  });

task('changeL2TokenBeaconOwner', 'Change the owner of l2 token beacon')
  .addParam('l2TokenBeacon', 'The address of l2 token beacon', undefined, types.string)
  .addParam('newOwner', 'The new owner address', undefined, types.string)
  .setAction(async taskArgs => {
    const l2TokenBeacon = taskArgs.l2TokenBeacon;
    const newOwner = taskArgs.newOwner;
    console.log(`Change the owner of l2TokenBeacon: ${l2TokenBeacon} to new owner: ${newOwner}`);
    const zkLinkNovaProvider = new Provider(process.env.ZKLINK_NOVA_RPC);
    const wallet = new ethers.Wallet(process.env.DEVNET_PRIVKEY, zkLinkNovaProvider);
    const abi = ["function owner() view returns (address)", "function transferOwnership(address newOwner) external"];
    const c = new ethers.Contract(l2TokenBeacon, abi, wallet);
    const ownerBefore = await c.owner();
    console.log("Change owner(before): ", ownerBefore);

    const tx = await c.transferOwnership(newOwner);
    console.log("Change owner tx: ", tx.hash);
    await tx.wait();

    const ownerAfter = await c.owner();
    console.log("Change owner(after): ", ownerAfter);
  });