const { JsonRpcProvider, Wallet, formatEther } = require('ethers');
const { LineaSDK, OnChainMessageStatus } = require("@consensys/linea-sdk");
const { readDeployContract, getLogName } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { task } = require('hardhat/config');

require('dotenv').config();

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

task('setValidator', 'Set validator for zkLink')
    .addParam('validator', 'Validator Address', undefined, types.string)
    .addOptionalParam('active', 'Whether to activate the validator address', true, types.boolean)
    .setAction(async (taskArgs, hre) => {
        const validatorAddr = taskArgs.validator;
        const isActive = taskArgs.active;
        console.log(`The validator: address: ${validatorAddr}, active: ${isActive}`);

        const walletPrivateKey = process.env.DEVNET_PRIVKEY;
        const l1Provider = new JsonRpcProvider(process.env.L1RPC);
        const l2Provider = new JsonRpcProvider(process.env.L2RPC);
        const ethereumName = process.env.ETHEREUM;
        const lineaName = process.env.LINEA;
        const l1Wallet = new Wallet(walletPrivateKey, l1Provider);
        const l2Wallet = new Wallet(walletPrivateKey, l2Provider);
        const sdk = new LineaSDK({
            l1RpcUrl: process.env.L1RPC ?? "",
            l2RpcUrl: process.env.L2RPC ?? "",
            l1SignerPrivateKey: walletPrivateKey ?? "",
            l2SignerPrivateKey: walletPrivateKey ?? "",
            network: "linea-goerli",
            mode: "read-write",
        });
        const lineaL1Contract = sdk.getL1Contract();
        const lineaL2Contract = sdk.getL2Contract();

        const l1WalletAddress = await l1Wallet.getAddress();
        const l1WalletBalance = formatEther(await l1Provider.getBalance(l1WalletAddress));
        console.log(`${l1WalletAddress} balance on l1: ${l1WalletBalance} ether`);
        const l2WalletAddress = await l2Wallet.getAddress();
        const l2WalletBalance = formatEther(await l2Provider.getBalance(l2WalletAddress));
        console.log(`${l2WalletAddress} balance on l2: ${l2WalletBalance} ether`);

        const arbitratorAddr = readDeployContract(
            logName.DEPLOY_ARBITRATOR_LOG_PREFIX,
            logName.DEPLOY_LOG_ARBITRATOR,
            ethereumName,
        );
        if (arbitratorAddr === undefined) {
            console.log('The arbitrator address not exist');
            return;
        }
        console.log(`The arbitrator address: ${arbitratorAddr}`);

        const l1GatewayLogName = getLogName(logName.DEPLOY_L1_GATEWAY_LOG_PREFIX, lineaName);
        const lineaL1GatewayAddr = readDeployContract(
            l1GatewayLogName,
            logName.DEPLOY_GATEWAY,
            ethereumName,
        );
        if (lineaL1GatewayAddr === undefined) {
            console.log('linea l1 gateway address not exist');
            return;
        }
        console.log(`The linea l1 gateway address: ${lineaL1GatewayAddr}`);

        const lineaL2GatewayAddr = readDeployContract(
            logName.DEPLOY_L2_GATEWAY_LOG_PREFIX,
            logName.DEPLOY_GATEWAY,
            lineaName,
        );
        if (lineaL2GatewayAddr === undefined) {
            console.log('linea l2 gateway address not exist');
            return;
        }
        console.log(`The linea l2 gateway address: ${lineaL2GatewayAddr}`);

        // forward message to L2
        const arbitrator = await hre.ethers.getContractAt('Arbitrator', arbitratorAddr, l1Wallet);
        const adapterParams = '0x';
        let tx = await arbitrator.setValidator(lineaL1GatewayAddr, validatorAddr, isActive, adapterParams);
        await tx.wait();
        console.log(`The tx hash: ${tx.hash}`);

        /**
         * Query the transaction status on L2 via messageHash.
         */
        const message = (await lineaL1Contract.getMessagesByTransactionHash(tx.hash)).pop();

        // Waiting for the official Linea bridge to forward the message to L2
        // And manually claim the message on L2
        /*eslint no-constant-condition: ["error", { "checkLoops": false }]*/
        while (true) {
            const messageStatus = await lineaL2Contract.getMessageStatus(message.messageHash);
            console.log(`The message status: ${messageStatus}`);
            if (messageStatus === OnChainMessageStatus.CLAIMABLE) {
                const lineaL2Gateway = await hre.ethers.getContractAt('LineaL2Gateway', lineaL2GatewayAddr, l2Wallet);
                const tx = await lineaL2Gateway.claimMessage(message.value.toNumber(), message.calldata, message.messageNonce.toNumber());
                console.log(`The tx hash: ${tx.hash}`);
                const rec = await tx.wait();
                console.log(`The tx receipt: ${JSON.stringify(rec)}`);
                break;
            }
            await sleep(60 * 1000 * 10);
        }
        console.log('Done');
    });
