const optimism = require('@eth-optimism/sdk');
const ethers = require('ethers');
const { syncBatchRoot, syncL2Requests, setValidator, changeFeeParams, encodeSetValidator, encodeChangeFeeParams } = require('../../utils/opstack-utils');
const { task } = require('hardhat/config');
require('dotenv').config();

async function initMessenger() {
    const walletPrivateKey = process.env.DEVNET_PRIVKEY;
    const l1Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L1RPC);
    const l2Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L2RPC);
    const ethereumName = process.env.ETHEREUM;
    const optimismName = process.env.OPTIMISM;
    const l1Wallet = new ethers.Wallet(walletPrivateKey, l1Provider);
    const l2Wallet = new ethers.Wallet(walletPrivateKey, l2Provider);
    const messenger = new optimism.CrossChainMessenger({
        l1ChainId: await l1Wallet.getChainId(), // 11155111 for Sepolia, 1 for Ethereum
        l2ChainId: await l2Wallet.getChainId(), // 11155420 for OP Sepolia, 10 for OP Mainnet
        l1SignerOrProvider: l1Wallet,
        l2SignerOrProvider: l2Wallet,
    });

    return { l1Wallet, l2Wallet, messenger, ethereumName, optimismName };
}

task('syncBatchRoot', 'Forward message to L2').setAction(async (_, hre) => {
    const { l1Wallet, l2Wallet, messenger, ethereumName, optimismName } = await initMessenger();

    const l1WalletAddress = await l1Wallet.getAddress();
    const l1WalletBalance = ethers.utils.formatEther(await l1Wallet.getBalance());
    console.log(`${l1WalletAddress} balance on l1: ${l1WalletBalance} ether`);

    const message = await syncBatchRoot(hre, messenger, l1Wallet, l2Wallet.provider, ethereumName, optimismName, "optimism");
    // Waiting for the official optimism bridge to forward the message to L2
    const rec = await messenger.waitForMessageReceipt(message);
    console.log(`The tx receipt: ${JSON.stringify(rec)}`);
    console.log('Done');

    // Example txs:
    // https://sepolia.etherscan.io/tx/0x4245b341b159a79d6cf35b917b849ccc8d5b3ae6fac947bc7376650844bdc43c
    // https://sepolia-optimistic.etherscan.io/tx/0x7779fbaf0358f34d2303d77019d09c39a0a0b178d9f6c4235c7bc5519ba9b58b
});

task('syncL2Requests', 'Send sync point to arbitrator')
    .addParam('txs', 'New sync point', 100, types.int, true)
    .setAction(async (taskArgs, hre) => {
        const txs = taskArgs.txs;
        console.log(`The sync point: txs: ${txs}`);

        const { l2Wallet, messenger, ethereumName, optimismName } = await initMessenger();

        const l2WalletAddress = await l2Wallet.getAddress();
        const l2WalletBalance = ethers.utils.formatEther(await l2Wallet.getBalance());
        console.log(`${l2WalletAddress} balance on l2: ${l2WalletBalance} ether`);

        const message = await syncL2Requests(hre, messenger, l2Wallet, ethereumName, optimismName, 'optimism', txs);
        // Waiting for the official optimism bridge to forward the message to L2
        const rec = await messenger.waitForMessageReceipt(message);
        console.log(`The tx receipt: ${JSON.stringify(rec)}`);
        console.log('Done! Your transaction is executed');

        // Example txs:
        // https://sepolia-optimistic.etherscan.io/tx/0xd1be4141ad192ddb978bfb324aaa41c2bddfdabce159de710e658db98d7c6885
        // https://sepolia.etherscan.io/tx/0x18be026ceed349625363f84a75c0384e69c549a972d79e78f327c2a1647a183d
    });

task('setValidator', 'Set validator for zkLink')
    .addParam('validator', 'Validator Address', undefined, types.string)
    .addOptionalParam('active', 'Whether to activate the validator address', true, types.boolean)
    .setAction(async (taskArgs, hre) => {
        const validatorAddr = taskArgs.validator;
        const isActive = taskArgs.active;
        console.log(`The validator: address: ${validatorAddr}, active: ${isActive}`);

        const { l1Wallet, messenger, ethereumName, optimismName } = await initMessenger();

        const l1WalletAddress = await l1Wallet.getAddress();
        const l1WalletBalance = ethers.utils.formatEther(await l1Wallet.getBalance());
        console.log(`${l1WalletAddress} balance on l1: ${l1WalletBalance} ether`);

        const message = await setValidator(hre, messenger, l1Wallet, ethereumName, optimismName, "optimism", validatorAddr, isActive);
        // Waiting for the official optimism bridge to forward the message to L2
        const rec = await messenger.waitForMessageReceipt(message);
        console.log(`The tx receipt: ${JSON.stringify(rec)}`);
        console.log('Done');
    });

task('changeFeeParams', 'Change fee params for zkLink').setAction(async (taskArgs, hre) => {
    const { l1Wallet, messenger, ethereumName, optimismName } = await initMessenger();

    const l1WalletAddress = await l1Wallet.getAddress();
    const l1WalletBalance = ethers.utils.formatEther(await l1Wallet.getBalance());
    console.log(`${l1WalletAddress} balance on l1: ${l1WalletBalance} ether`);

    const message = await changeFeeParams(hre, messenger, l1Wallet, ethereumName, optimismName, "optimism");

    // Waiting for the official optimism bridge to forward the message to L2
    const rec = await messenger.waitForMessageReceipt(message);
    console.log(`The tx receipt: ${JSON.stringify(rec)}`);
    console.log('Done');
});

task('encodeSetValidator', 'Get the calldata of set validator for zkLink')
    .addParam('validator', 'Validator Address', undefined, types.string)
    .addOptionalParam('active', 'Whether to activate the validator address', true, types.boolean)
    .setAction(async (taskArgs, hre) => {
        const validatorAddr = taskArgs.validator;
        const isActive = taskArgs.active;
        console.log(`The validator: address: ${validatorAddr}, active: ${isActive}`);

        const { messenger, ethereumName, optimismName } = await initMessenger();

        await encodeSetValidator(hre, messenger, ethereumName, optimismName, "optimism", validatorAddr, isActive);
    });

task('encodeChangeFeeParams', 'Get the calldata of changing fee params for zkLink').setAction(async (taskArgs, hre) => {
    const { messenger, ethereumName, optimismName } = await initMessenger();

    await encodeChangeFeeParams(hre, messenger, ethereumName, optimismName, "optimism");
});
