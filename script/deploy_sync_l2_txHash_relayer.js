const fs = require('fs');
const { getImplementationAddress } = require('@openzeppelin/upgrades-core');
const {
    verifyContractCode,
    createOrGetDeployLog,
    ChainContractDeployer,
    getDeployTx,
    readDeployContract,
    readDeployLogField,
    getLogName,
} = require('./utils');
const logName = require('./deploy_log_name');
const { task, types } = require('hardhat/config');

function getRelayerContractName() {
    return 'SyncL2TxHashRelayer';
}

task('deploySyncL2TxHashRelayer', 'Deploy SyncL2TxHashRelayer')
    .addParam('messageService', 'The primary chain message service', undefined, types.string, false)
    .addParam('l1Gateway', 'The primary chain l1 gateway', undefined, types.string, false)
    .addParam(
        'arbitrator',
        'The arbitrator address (default get from arbitrator deploy log)',
        undefined,
        types.string,
        true,
    )
    .addParam('skipVerify', 'Skip verify', false, types.boolean, true)
    .setAction(async (taskArgs, hardhat) => {
        let arbitrator = taskArgs.arbitrator;
        if (arbitrator === undefined) {
            arbitrator = readDeployLogField(logName.DEPLOY_ARBITRATOR_LOG_PREFIX, logName.DEPLOY_LOG_ARBITRATOR);
        }
        let l1Gateway = taskArgs.l1Gateway;
        let messageService = taskArgs.messageService;
        let skipVerify = taskArgs.skipVerify;
        console.log('arbitrator', arbitrator);
        console.log('primary chain l1 gateway', l1Gateway);
        console.log('message service', messageService);
        console.log('skip verify contracts?', skipVerify);

        const contractDeployer = new ChainContractDeployer(hardhat);
        await contractDeployer.init();
        const deployerWallet = contractDeployer.deployerWallet;

        const { deployLogPath, deployLog } = createOrGetDeployLog(logName.DEPLOY_SYNCL2TXHASHRELAYER_LOG_PREFIX);
        deployLog[logName.DEPLOY_LOG_DEPLOYER] = deployerWallet.address;
        fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));

        // deploy syncL2TxHashRelayer
        let syncL2TxHashRelayerAddr;
        if (!(logName.DEPLOY_LOG_SYNCL2TXHASHRELAYER in deployLog)) {
            console.log('deploy syncL2TxHashRelayer...');
            const contractName = getRelayerContractName();
            const contract = await contractDeployer.deployProxy(
                contractName,
                [],
                [messageService, arbitrator, l1Gateway],
            );
            const transaction = await getDeployTx(contract);
            syncL2TxHashRelayerAddr = await contract.getAddress();
            deployLog[logName.DEPLOY_LOG_SYNCL2TXHASHRELAYER] = syncL2TxHashRelayerAddr;
            deployLog[logName.DEPLOY_LOG_DEPLOY_TX_HASH] = transaction.hash;
            deployLog[logName.DEPLOY_LOG_DEPLOY_BLOCK_NUMBER] = transaction.blockNumber;
            fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
        } else {
            syncL2TxHashRelayerAddr = deployLog[logName.DEPLOY_LOG_SYNCL2TXHASHRELAYER];
        }
        console.log('syncL2TxHashRelayer', syncL2TxHashRelayerAddr);

        let syncL2TxHashRelayerTargetAddr;
        if (!(logName.DEPLOY_LOG_SYNCL2TXHASHRELAYER_TARGET in deployLog)) {
            console.log('get syncL2TxHashRelayer target...');
            syncL2TxHashRelayerTargetAddr = await getImplementationAddress(hardhat.ethers.provider, syncL2TxHashRelayerAddr);
            deployLog[logName.DEPLOY_LOG_SYNCL2TXHASHRELAYER_TARGET] = syncL2TxHashRelayerTargetAddr;
            fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
        } else {
            syncL2TxHashRelayerTargetAddr = deployLog[logName.DEPLOY_LOG_SYNCL2TXHASHRELAYER_TARGET];
        }
        console.log('syncL2TxHashRelayer target', syncL2TxHashRelayerTargetAddr);

        // verify target contract
        if (!(logName.DEPLOY_LOG_SYNCL2TXHASHRELAYER_VERIFIED in deployLog) && !skipVerify) {
            await verifyContractCode(hardhat, syncL2TxHashRelayerTargetAddr, [messageService, arbitrator, l1Gateway]);
            deployLog[logName.DEPLOY_LOG_SYNCL2TXHASHRELAYER_VERIFIED] = true;
            fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
        }

        // verify proxy contract
        if (!(logName.DEPLOY_LOG_SYNCL2TXHASHRELAYER_VERIFIED in deployLog) && !skipVerify) {
            await verifyContractCode(hardhat, syncL2TxHashRelayerAddr, []);
            deployLog[logName.DEPLOY_LOG_SYNCL2TXHASHRELAYER_VERIFIED] = true;
            fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
        }
    });

task('upgradeSyncL2TxHashRelayer', 'Upgrade syncL2TxHashRelayer')
    .addParam('messageService', 'The primary chain message service', undefined, types.string, false)
    .addParam('l1Gateway', 'The primary chain l1 gateway', undefined, types.string, false)
    .addParam(
        'arbitrator',
        'The arbitrator address (default get from arbitrator deploy log)',
        undefined,
        types.string,
        true,
    )
    .addParam('skipVerify', 'Skip verify', false, types.boolean, true)
    .setAction(async (taskArgs, hardhat) => {
        let arbitrator = taskArgs.arbitrator;
        if (arbitrator === undefined) {
            arbitrator = readDeployLogField(logName.DEPLOY_ARBITRATOR_LOG_PREFIX, logName.DEPLOY_LOG_ARBITRATOR);
        }
        let l1Gateway = taskArgs.l1Gateway;
        let messageService = taskArgs.messageService;
        let skipVerify = taskArgs.skipVerify;
        console.log('arbitrator', arbitrator);
        console.log('primary chain l1 gateway', l1Gateway);
        console.log('message service', messageService);
        console.log('skip verify contracts?', skipVerify);

        const l1GatewayLogName = getLogName(logName.DEPLOY_L1_GATEWAY_LOG_PREFIX, targetNetwork);
        const l1GatewayAddr = readDeployContract(l1GatewayLogName, logName.DEPLOY_GATEWAY);
        if (l1GatewayAddr === undefined) {
            console.log(`${targetNetwork} l1 gateway address not exist`);
            return;
        }
        console.log(`The ${targetNetwork} l1 gateway address: ${l1GatewayAddr}`);

        const { deployLogPath, deployLog } = createOrGetDeployLog(logName.DEPLOY_SYNCL2TXHASHRELAYER_LOG_PREFIX);
        const contractAddr = deployLog[logName.DEPLOY_LOG_SYNCL2TXHASHRELAYER];
        if (contractAddr === undefined) {
            console.log('syncL2TxHashRelayer address not exist');
            return;
        }
        console.log('syncL2TxHashRelayer', contractAddr);
        const oldContractTargetAddr = deployLog[logName.DEPLOY_LOG_SYNCL2TXHASHRELAYER_TARGET];
        if (oldContractTargetAddr === undefined) {
            console.log('syncL2TxHashRelayer target address not exist');
            return;
        }
        console.log('syncL2TxHashRelayer old target', oldContractTargetAddr);

        const contractDeployer = new ChainContractDeployer(hardhat);
        await contractDeployer.init();

        console.log('upgrade syncL2TxHashRelayer...');
        const contractName = getRelayerContractName();
        const contract = await contractDeployer.upgradeProxy(contractName, contractAddr, [
            messageService,
            arbitrator,
            l1Gateway,
        ]);
        const tx = await getDeployTx(contract);
        console.log('upgrade tx', tx.hash);
        const newContractTargetAddr = await getImplementationAddress(hardhat.ethers.provider, contractAddr);
        deployLog[logName.DEPLOY_LOG_SYNCL2TXHASHRELAYER_TARGET] = newContractTargetAddr;
        console.log('syncL2TxHashRelayer new target', newContractTargetAddr);
        fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));

        // verify target contract
        if (!skipVerify) {
            await verifyContractCode(hardhat, newContractTargetAddr, [messageService, arbitrator, l1Gateway]);
            deployLog[logName.DEPLOY_LOG_SYNCL2TXHASHRELAYER_TARGET_VERIFIED] = true;
            fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
        }
    });
