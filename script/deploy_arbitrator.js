const fs = require("fs");
const { getImplementationAddress } = require("@openzeppelin/upgrades-core");
const { verifyContractCode, createOrGetDeployLog, ChainContractDeployer, getDeployTx} = require("./utils");
const logName = require("./deploy_log_name");

function getArbitratorContractName(dummy) {
    return dummy ? "DummyArbitrator": "Arbitrator";
}

task("deployArbitrator", "Deploy arbitrator")
    .addParam("force", "Fore redeploy all contracts", false, types.boolean, true)
    .addParam("skipVerify", "Skip verify", false, types.boolean, true)
    .addParam("dummy", "Deploy dummy contract for test", false, types.boolean, true)
    .setAction(async (taskArgs, hardhat) => {
        let force = taskArgs.force;
        let skipVerify = taskArgs.skipVerify;
        let dummy = taskArgs.dummy;
        console.log('force redeploy all contracts?', force);
        console.log('skip verify contracts?', skipVerify);
        console.log('deploy dummy contracts?', dummy);

        const contractDeployer = new ChainContractDeployer(hardhat);
        await contractDeployer.init();
        const deployerWallet = contractDeployer.deployerWallet;

        const {deployLogPath,deployLog} = createOrGetDeployLog(logName.DEPLOY_ARBITRATOR_LOG_PREFIX);
        deployLog[logName.DEPLOY_LOG_GOVERNOR] = deployerWallet.address;
        fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));

        // deploy arbitrator
        let arbitratorAddr;
        if (!(logName.DEPLOY_LOG_ARBITRATOR in deployLog) || force) {
            console.log('deploy arbitrator...');
            const contractName = getArbitratorContractName(dummy);
            const contract = await contractDeployer.deployProxy(contractName);
            const transaction = await getDeployTx(contract);
            arbitratorAddr = await contract.getAddress();
            deployLog[logName.DEPLOY_LOG_ARBITRATOR] = arbitratorAddr;
            deployLog[logName.DEPLOY_LOG_DEPLOY_TX_HASH] = transaction.hash;
            deployLog[logName.DEPLOY_LOG_DEPLOY_BLOCK_NUMBER] = transaction.blockNumber;
            fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
        } else {
            arbitratorAddr = deployLog[logName.DEPLOY_LOG_ARBITRATOR];
        }
        console.log('arbitrator', arbitratorAddr);

        let arbitratorTargetAddr;
        if (!(logName.DEPLOY_LOG_ARBITRATOR_TARGET in deployLog) || force) {
            console.log('get arbitrator target...');
            arbitratorTargetAddr = await getImplementationAddress(
                hardhat.ethers.provider,
                arbitratorAddr
            );
            deployLog[logName.DEPLOY_LOG_ARBITRATOR_TARGET] = arbitratorTargetAddr;
            fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
        } else {
            arbitratorTargetAddr = deployLog[logName.DEPLOY_LOG_ARBITRATOR_TARGET];
        }
        console.log("arbitrator target", arbitratorTargetAddr);

        // verify target contract
        if ((!(logName.DEPLOY_LOG_ARBITRATOR_VERIFIED in deployLog) || force) && !skipVerify) {
            await verifyContractCode(hardhat, arbitratorTargetAddr, []);
            deployLog[logName.DEPLOY_LOG_ARBITRATOR_VERIFIED] = true;
            fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
        }

        // verify proxy contract
        if ((!(logName.DEPLOY_LOG_ARBITRATOR_VERIFIED in deployLog) || force) && !skipVerify) {
            await verifyContractCode(hardhat, arbitratorAddr, []);
            deployLog[logName.DEPLOY_LOG_ARBITRATOR_VERIFIED] = true;
            fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
        }
    });

task("upgradeArbitrator","Upgrade arbitrator")
    .addParam("skipVerify", "Skip verify", false, types.boolean, true)
    .addParam("dummy", "Deploy dummy contract for test", false, types.boolean, true)
    .setAction(async (taskArgs,hardhat)=>{
        let skipVerify = taskArgs.skipVerify;
        let dummy = taskArgs.dummy;
        console.log("skipVerify", skipVerify);
        console.log('deploy dummy contracts?', dummy);

        const { deployLogPath, deployLog } = createOrGetDeployLog(logName.DEPLOY_ARBITRATOR_LOG_PREFIX);
        const contractAddr = deployLog[logName.DEPLOY_LOG_ARBITRATOR];
        if (contractAddr === undefined) {
            console.log('arbitrator address not exist');
            return;
        }
        console.log('arbitrator', contractAddr);
        const oldContractTargetAddr = deployLog[logName.DEPLOY_LOG_ARBITRATOR_TARGET];
        if (oldContractTargetAddr === undefined) {
            console.log('arbitrator target address not exist');
            return;
        }
        console.log('arbitrator old target', oldContractTargetAddr);

        const contractDeployer = new ChainContractDeployer(hardhat);
        await contractDeployer.init();

        console.log("upgrade arbitrator...");
        const contractName = getArbitratorContractName(dummy);
        const contract = await contractDeployer.upgradeProxy(contractName, contractAddr);
        const tx = await getDeployTx(contract);
        console.log('upgrade tx', tx.hash);
        const newContractTargetAddr = await getImplementationAddress(hardhat.ethers.provider, contractAddr);
        deployLog[logName.DEPLOY_LOG_ARBITRATOR_TARGET] = newContractTargetAddr;
        console.log("arbitrator new target", newContractTargetAddr);
        fs.writeFileSync(deployLogPath,JSON.stringify(deployLog, null, 2));

        // verify target contract
        if (!skipVerify) {
            await verifyContractCode(hardhat, newContractTargetAddr, []);
            deployLog[logName.DEPLOY_LOG_ARBITRATOR_TARGET_VERIFIED] = true;
            fs.writeFileSync(deployLogPath,JSON.stringify(deployLog, null, 2));
        }
    })