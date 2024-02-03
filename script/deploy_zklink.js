const fs = require("fs");
const { getImplementationAddress } = require("@openzeppelin/upgrades-core");
const { verifyContractCode, createOrGetDeployLog, ChainContractDeployer, getDeployTx} = require("./utils");
const logName = require("./deploy_log_name");

function getZkLinkContractName(dummy) {
    return dummy ? "DummyZkLink": "ZkLink";
}

task("deployZkLink", "Deploy zkLink")
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

        const {deployLogPath,deployLog} = createOrGetDeployLog(logName.DEPLOY_ZKLINK_LOG_PREFIX);
        deployLog[logName.DEPLOY_LOG_GOVERNOR] = deployerWallet.address;
        fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));

        // deploy zkLink
        let zkLinkAddr;
        if (!(logName.DEPLOY_LOG_ZKLINK_PROXY in deployLog) || force) {
            console.log('deploy zkLink...');
            const contractName = getZkLinkContractName(dummy);
            const contract = await contractDeployer.deployProxy(contractName);
            const transaction = await getDeployTx(contract);
            zkLinkAddr = await contract.getAddress();
            deployLog[logName.DEPLOY_LOG_ZKLINK_PROXY] = zkLinkAddr;
            deployLog[logName.DEPLOY_LOG_DEPLOY_TX_HASH] = transaction.hash;
            deployLog[logName.DEPLOY_LOG_DEPLOY_BLOCK_NUMBER] = transaction.blockNumber;
            fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
        } else {
            zkLinkAddr = deployLog[logName.DEPLOY_LOG_ZKLINK_PROXY];
        }
        console.log('zkLink', zkLinkAddr);

        let zkLinkTargetAddr;
        if (!(logName.DEPLOY_LOG_ZKLINK_TARGET in deployLog) || force) {
            console.log('get zkLink target...');
            zkLinkTargetAddr = await getImplementationAddress(
                hardhat.ethers.provider,
                zkLinkAddr
            );
            deployLog[logName.DEPLOY_LOG_ZKLINK_TARGET] = zkLinkTargetAddr;
            fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
        } else {
            zkLinkTargetAddr = deployLog[logName.DEPLOY_LOG_ZKLINK_TARGET];
        }
        console.log("zkLink target", zkLinkTargetAddr);

        // verify target contract
        if ((!(logName.DEPLOY_LOG_ZKLINK_TARGET_VERIFIED in deployLog) || force) && !skipVerify) {
            await verifyContractCode(hardhat, zkLinkTargetAddr, []);
            deployLog[logName.DEPLOY_LOG_ZKLINK_TARGET_VERIFIED] = true;
            fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
        }

        // verify proxy contract
        if ((!(logName.DEPLOY_LOG_ZKLINK_PROXY_VERIFIED in deployLog) || force) && !skipVerify) {
            await verifyContractCode(hardhat, zkLinkAddr, []);
            deployLog[logName.DEPLOY_LOG_ZKLINK_PROXY_VERIFIED] = true;
            fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
        }
    });

task("upgradeZkLink","Upgrade zkLink")
    .addParam("skipVerify", "Skip verify", false, types.boolean, true)
    .addParam("dummy", "Deploy dummy contract for test", false, types.boolean, true)
    .setAction(async (taskArgs,hardhat)=>{
        let skipVerify = taskArgs.skipVerify;
        let dummy = taskArgs.dummy;
        console.log("skipVerify", skipVerify);
        console.log('deploy dummy contracts?', dummy);

        const { deployLogPath, deployLog } = createOrGetDeployLog(logName.DEPLOY_ZKLINK_LOG_PREFIX);
        const contractAddr = deployLog[logName.DEPLOY_LOG_ZKLINK_PROXY];
        if (contractAddr === undefined) {
            console.log('zkLink address not exist');
            return;
        }
        console.log('zkLink', contractAddr);
        const oldContractTargetAddr = deployLog[logName.DEPLOY_LOG_ZKLINK_TARGET];
        if (oldContractTargetAddr === undefined) {
            console.log('zkLink target address not exist');
            return;
        }
        console.log('zkLink old target', oldContractTargetAddr);

        const contractDeployer = new ChainContractDeployer(hardhat);
        await contractDeployer.init();

        console.log("upgrade zkLink...");
        const contractName = getZkLinkContractName(dummy);
        const contract = await contractDeployer.upgradeProxy(contractName, contractAddr);
        const tx = await getDeployTx(contract);
        console.log('upgrade tx', tx.hash);
        const newContractTargetAddr = await getImplementationAddress(hardhat.ethers.provider, contractAddr);
        deployLog[logName.DEPLOY_LOG_ZKLINK_TARGET] = newContractTargetAddr;
        console.log("zkLink new target", newContractTargetAddr);
        fs.writeFileSync(deployLogPath,JSON.stringify(deployLog, null, 2));

        // verify target contract
        if (!skipVerify) {
            await verifyContractCode(hardhat, newContractTargetAddr, []);
            deployLog[logName.DEPLOY_LOG_ZKLINK_TARGET_VERIFIED] = true;
            fs.writeFileSync(deployLogPath,JSON.stringify(deployLog, null, 2));
        }
    })