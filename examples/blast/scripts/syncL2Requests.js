const blast = require('@eth-optimism/sdk');
const ethers = require('ethers');
const { readDeployContract } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { OPTIMISM_PORTAL_ABI, YIELD_MANAGER_ABI, YIELD_MANAGER_MAINNET_ADDRESS, YIELD_MANAGER_TESTNET_ADDRESS, L1_MAINNET_CONTRACTS, L1_TESTNET_CONTRACTS } = require('./constants');
const { task, types } = require('hardhat/config');

require('dotenv').config();
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

task('syncL2Requests', 'Send sync point to arbitrator')
    .addParam('txs', 'New sync point', 100, types.int, true)
    .setAction(async (taskArgs, hre) => {
        const txs = taskArgs.txs;
        console.log(`The sync point: txs: ${txs}`);

        const walletPrivateKey = process.env.DEVNET_PRIVKEY;
        const l1Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L1RPC);
        console.log(`The l1 block number: ${await l1Provider.getBlockNumber()}`);
        const l2Provider = new ethers.providers.StaticJsonRpcProvider(process.env.L2RPC);
        const blastName = process.env.BLAST;
        const ethereumName = process.env.ETHEREUM;
        const l1Wallet = new ethers.Wallet(walletPrivateKey, l1Provider);
        const l2Wallet = new ethers.Wallet(walletPrivateKey, l2Provider);
        const messengerL1Contracts = ethereumName !== "ETHEREUM" ? L1_TESTNET_CONTRACTS : L1_MAINNET_CONTRACTS;
        const yieldManagerAddress = ethereumName !== "ETHEREUM" ? YIELD_MANAGER_TESTNET_ADDRESS : YIELD_MANAGER_MAINNET_ADDRESS;
        const messenger = new blast.CrossChainMessenger({
            l1ChainId: await l1Wallet.getChainId(), // 11155111 for Sepolia, 1 for Ethereum
            l2ChainId: await l2Wallet.getChainId(), // 168587773 for Blast Testnet, 81457 for Blast Mainnet
            l1SignerOrProvider: l1Wallet,
            l2SignerOrProvider: l2Wallet,
            bridges: {
                Standard: {
                    Adapter: blast.StandardBridgeAdapter,
                    l1Bridge: messengerL1Contracts.L1StandardBridge,
                    l2Bridge: "0x4200000000000000000000000000000000000010",
                },
            },
            contracts: {
                l1: messengerL1Contracts,
            }
        });

        const optimismPortalContract = await hre.ethers.getContractAt(OPTIMISM_PORTAL_ABI, messengerL1Contracts.OptimismPortal, l1Wallet);
        console.log(`The optimism portal contract address: ${optimismPortalContract.address}`);

        const yieldManagerContract = await hre.ethers.getContractAt(YIELD_MANAGER_ABI, yieldManagerAddress, l1Wallet);
        console.log(`The yield manager contract address: ${yieldManagerContract.address}`);

        const l2WalletAddress = await l2Wallet.getAddress();
        const l2WalletBalance = ethers.utils.formatEther(await l2Wallet.getBalance());
        console.log(`${l2WalletAddress} balance on l2: ${l2WalletBalance} ether`);

        const blastL2GatewayAddr = readDeployContract(
            logName.DEPLOY_L2_GATEWAY_LOG_PREFIX,
            logName.DEPLOY_GATEWAY,
            blastName,
        );
        if (blastL2GatewayAddr === undefined) {
            console.log('blast l2 gateway address not exist');
            return;
        }
        console.log(`The blast l2 gateway address: ${blastL2GatewayAddr}`);

        const zkLinkAddr = readDeployContract(logName.DEPLOY_ZKLINK_LOG_PREFIX, logName.DEPLOY_LOG_ZKLINK_PROXY, blastName);
        if (zkLinkAddr === undefined) {
            console.log('zkLink address not exist');
            return;
        }
        console.log(`The zkLink address: ${zkLinkAddr}`);

        // send txs
        const zkLink = await hre.ethers.getContractAt('ZkLink', zkLinkAddr, l2Wallet);
        // console.log(`Send a l2 message to l1...`);
        // let tx = await zkLink.syncL2Requests(txs, {
        //     value: ethers.utils.parseEther('0.001'),
        // });
        // let txHash = tx.hash;
        // console.log(`The tx hash: ${txHash}`);
        // await tx.wait();
        // console.log(`The transaction has been executed on L2`);
        // txHash = "0xf96f9ede51b34ed3a8eba7234bd1573becf6c95e9fb4a47c791794b3e3588aa2"
        txHash = "0x27b042970995a44c6e0e2f63a3cc317c50bb35d7c6e1cba9bb384756239700ac"
        // txHash = "0x0fd3b70bf7b5b478b4bd115e9c73c792a7ffdb5730d86ee82b1ea03b33520178"
        // txHash = "0xc556d10f18485a955a69e2101ad86900067ff11bf79e3ed3cf18f1a59057d226"  // with value
        const message = (await messenger.getMessagesByTransaction(txHash)).pop();
        console.log(`The message: ${JSON.stringify(message, null, 2)}`);

        let status = await messenger.getMessageStatus(txHash);
        console.log(`The message status: ${status}`);

        /**
         * Wait until the message is ready to prove
         * This step takes about 45 minutes.
         */
        // while (status !== blast.MessageStatus.READY_TO_PROVE) {
        //     await sleep(60 * 1000 * 10); // 10 minutes
        //     status = await messenger.getMessageStatus(txHash);
        //     console.log(`The message status update to: ${status}`);
        // }
        // /**
        //  * Once the message is ready to be proven, you'll send an L1 transaction to prove that the message was sent on L2.
        //  */
        // console.log(`Proving the message...`);
        // tx = await messenger.proveMessage(txHash);
        // console.log(`The prove tx hash: ${tx.hash}`);
        // const proveTxReceipt = await tx.wait();
        // console.log(`The message has been proven, receipt: ${JSON.stringify(proveTxReceipt, null, 2)}`);

        const proveTxHash = "0xc24562afdaf41277023333cf8704833ca3b6f02174cbae035e0ef49bebe5af4c"
        const withdrawalProven = await messenger.getProvenWithdrawal(proveTxHash);
        console.log(`The withdrawal proven: ${JSON.stringify(withdrawalProven, null, 2)}`);
        // const proveTxReceipt = await l1Provider.getTransactionReceipt(proveTxHash);
        // const proveTxResp = await l1Provider.getTransaction(proveTxHash);
        // console.log(`The prove tx resp: ${JSON.stringify(proveTxResp, null, 2)}`);
        let requestId, withdrawalHash
        for (const log of proveTxReceipt.logs) {
            switch (log.address.toLowerCase()) {
                case optimismPortalContract.address.toLowerCase(): {
                    const parsed = optimismPortalContract.interface.parseLog(log);
                    if (parsed.name === 'WithdrawalProven') {
                        requestId = parsed.args.requestId
                        withdrawalHash = parsed.args.withdrawalHash
                    }
                }
            }
        }
        console.log(`The request id: ${requestId}, type: ${typeof requestId}`);
        console.log(`The withdrawal hash: ${withdrawalHash}`);

        const params = optimismPortalContract.interface.decodeFunctionData('proveWithdrawalTransaction', '0x4870496f00000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000005130000000000000000000000000000000000000000000000000000000000000000faeb48336446a6d6d6ead7431bca1d6791a3367fa615acadf260528c50916143f138aed5c3df6ebd999078bbaec07e6d9d68ddbd72f6917f4504400324211553a3fcbf13d57f45b4924c88f3afb53293280e0c0ed79b4dbe9cc6b38d85cf67f80000000000000000000000000000000000000000000000000000000000000380000100000000000000000000000000000000000000000000000000000000007800000000000000000000000042000000000000000000000000000000000000070000000000000000000000009338f298f29d3918d5d1feb209aeb9915cc963330000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004638800000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000001a4d764ad0b0001000000000000000000000000000000000000000000000000000000000075000000000000000000000000815b4104d9a27d15d8daf2957bc98e10a700a2bc000000000000000000000000ced6a41353a30dd71c92eb58db3d8c264fbd6c6b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000a4031e7b610000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000002a000000000000000000000000000000000000000000000000000000000000004200000000000000000000000000000000000000000000000000000000000000214f90211a0fd01258f9121c6e22c59fea6e7da69198add6089a431ddb9330c0d88fef0da3aa06634ee8326f2dadcddbf8259e4ba9705be59dbc9fe5b9d7c1f8a2fc67d6bed8da0059833a24e5ea8f15dae359b3425028e5881046e18e8f5bc0326fe53ee8dabeda0b2576154b87aaf30b73435c925f2534c99a64a5b368c197df440f401a9ba73aca016c8526dfd1529358871f2d2a11b78daf87201b1c8880921da46976fab56a250a009acda30d52966181e198514fd031074896a9fbe5bcba95b7fe6af40bc5fafa1a0660b5ae0fef0631455e444c8e8df4ed7902f690f15c5c5104313de8058ca3e3ca02c91f9961f41a929bf5adf59103fee65881573844e45b93dbc32665637d40a7da0d64ea3d6341bae0a16561ecf04177dfd8c863c1a236f8393c8e85fa3cc50ad07a048951172846c5d9093a01f47f75cebe6d9e472e4f7c14d7fa58552de04e7773da0fecb30f643dc1ed16ac7c3ac7a21cbf73b6b9041dace701e73a50d2a9bb8e49da0b2a15084d6e404fe224d5b57456445c06f69141dbb9eb7f341c6cc46d1f9bd4da062694cd98257b3ff23d2b17a786e3e532c8a43d0a68cf024843e9dda9ada7f65a04e0fe70839b0ed8650ab8a5f61d3a61aacff486bac719f15462262e1c5a681d5a00173ecdad3fe288aa382a248b22197095721047b2d89497f780bc5053f7cca42a0567d5614865312cb2a1a10e4cda1d9f3b4191e5d05dbcd17408bfffc72e9b935800000000000000000000000000000000000000000000000000000000000000000000000000000000000000154f90151a0a495a4d9b4f84307f7500791ebc00e7ca7140ebd8d50f7976ea85f1f437a0ec0a0ab13e353109944ed33da435253c73aeee6db2fd530a53c4ca8d6487d73240333a0370a4bb2e59fab5ebec9b56b867b48e985bb9ad546d2d7a3730738b30cbea8ab80a08c9a64602cfcc41ce58bb368b25fcece7903ad4e0f5e7eab807cfd23bf2c38eca0fa139c57a43e3473997436f56ae33105ab65f4a6c8788f196cd17cc824523a1f80a056b01d956930a65dd8216eac83e86d04a95d5cdb700e062b563aa7e605ee9720a0400a56b5261cccfac48e06f62509f597291a9514eda7f9471d42d9e0feec0a2f8080a03f083df2413aa84e1a75af80e2f3acb1b6a28afca0cf62c49149874e5e2f57d48080a0cf84653f05e189f8f099eae9cdd33aa56e45487ea6875080e0ab32e1a5346509a0c07a5f5e4ceb995334de7372548ca005b93ade88187e014b405cd86c08686a95800000000000000000000000000000000000000000000000000000000000000000000000000000000000000023e2a020003bd84df36e1f2670211733e1cbd2ba53dd319b72cdaf3137d9eedf848c09010000000000000000000000000000000000000000000000000000000000');
        console.log(`The params: ${JSON.stringify(params, null, 2)}`);

        // const admin = await yieldManagerContract.admin()
        // console.log(`The admin: ${admin}`);

        // const l2OutOracle = messenger.contracts.l1.L2OutputOracle;
        // console.log(`The l2 out oracle address: ${l2OutOracle.address}`);

        // const period = await l2OutOracle.finalizationPeriodSeconds();
        // console.log(`The finalization period: ${period}`);
        // const startTime = await l2OutOracle.startingTimestamp();
        // console.log(`The starting timestamp: ${startTime}`);



        // console.log(`The message nonce: ${message.messageNonce}, type: ${typeof message.messageNonce}`);
        // withdrawalHash = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["uint256", "address", "address", "uint256", "uint256", "bytes"], [message.messageNonce, message.sender, message.target, message.value, message.minGasLimit, message.message]));
        // console.log(`The withdrawal hash: ${withdrawalHash}`);

        // const ProvenWithdrawal = await optimismPortalContract.provenWithdrawals(withdrawalHash);
        // console.log(`The proven withdrawal: ${JSON.stringify(ProvenWithdrawal, null, 2)}`);

        if (requestId.toNumber() == 0) {
            // sleep(12 * 1000);
            // status = await messenger.getMessageStatus(txHash);
            // console.log(`The message status: ${status}`);
            // console.log(`Relaying the message...`);
            // const params = await optimismPortalContract.params();
            // console.log(`The params: ${JSON.stringify(params, null, 2)}`);
            // const callData = optimismPortalContract.interface.encodeFunctionData('finalizeWithdrawalTransaction', [0, [message.messageNonce, message.sender, message.target, message.value, message.minGasLimit, message.message]]);
            // console.log(`The call data: ${callData}`);
            // const claimTx = await optimismPortalContract.finalizeWithdrawalTransaction(0, [message.messageNonce, message.sender, message.target, message.value, message.minGasLimit, message.message]);
            // console.log(`The claim tx hash: ${claimTx.hash}`);
            // const claimTxReceipt = await claimTx.wait()
            // console.log(`The claim tx receipt: ${JSON.stringify(claimTxReceipt, null, 2)}`);
        }
        // const lastRequestId = await yieldManagerContract.getLastFinalizedRequestId();
        // console.log(`The last finalized request id: ${lastRequestId}`);

        // const lastCheckpointId = await yieldManagerContract.getLastCheckpointId();
        // console.log(`The last checkpoint id: ${lastCheckpointId}`);
        // const hint = await yieldManagerContract.findCheckpointHint(requestId, 1, 5);
        // console.log(`The hint: ${hint}`);

        // status = await messenger.getMessageStatus(txHash);
        // console.log(`The message status: ${status}`);
        // /**
        //  * Wait until the message is ready for relay
        //  * The final step to sending messages from L2 to L1 is to relay the messages on L1. This can only happen after the fault proof period has elapsed. On OP Sepolia, this is only a few seconds. On OP Mainnet, this takes 7 days.
        //  * Blast is same way as Optimism
        //  */
        // while (status !== blast.MessageStatus.READY_FOR_RELAY) {
        //     await sleep(60 * 1000); // 1 minute
        //     status = await messenger.getMessageStatus(txHash);
        //     console.log(`The message status update to: ${status}`);
        // }
        // console.log(`The message is ready for relay`);
        // await sleep(12 * 1000); // 12 seconds, Waiting for a block to ensure the PROVE transaction is on the chain
        // /**
        //  * Relay the message on L1
        //  * Once the withdrawal is ready to be relayed you can finally complete the message sending process.
        //  */
        // console.log(`Relaying the message...`);
        // const message = (await messenger.getMessagesByTransaction(txHash)).pop()
        // console.log(`The message: ${JSON.stringify(message, null, 2)}`);

        // tx = await messenger.finalizeMessage(txHash);
        // console.log(`The relay tx hash: ${tx.hash}`);
        // const receipt = await tx.wait();
        // console.log(`The message has been relayed, receipt: ${JSON.stringify(receipt, null, 2)}`);
        /**
         * Wait until the message is relayed
         * Now you simply wait until the message is relayed.
         */
        // Waiting for the official blast bridge to forward the message to L2
        // const rec = await messenger.waitForMessageReceipt(txHash);
        // console.log(`The tx receipt: ${JSON.stringify(rec, null, 2)}`);
        console.log('Done!');

        // Example txs:
        // https://pacific-explorer.testnet.blast.network/tx/0x1a81ed28c1b74120753b0edf3d98e80b814ec5f065ad44b26c0cd6131dc04d22
        // https://goerli.etherscan.io/tx/0x54ce6421e1d9c1e7d2c35af292c9e3bbaf632b60115556a94b7fb61e53905599
    });
