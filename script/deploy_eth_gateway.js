const fs = require("fs");
const { getImplementationAddress } = require("@openzeppelin/upgrades-core");
const { verifyContractCode, createOrGetDeployLog, ChainContractDeployer, getDeployTx, readDeployLogField} = require("./utils");
const logName = require("./deploy_log_name");

task("deployETHGateway", "Deploy ETH Gateway")
    .addParam("arbitrator", "The arbitrator address (default get from arbitrator deploy log)", undefined, types.string, true)
    .addParam("zklink", "The zklink address (default get from zkLink deploy log)", undefined, types.string, true)
    .addParam("force", "Fore redeploy all contracts", false, types.boolean, true)
    .addParam("skipVerify", "Skip verify", false, types.boolean, true)
    .setAction(async (taskArgs, hardhat) => {
        let arbitrator = taskArgs.arbitrator;
        if (arbitrator === undefined) {
            arbitrator = readDeployLogField(logName.DEPLOY_ARBITRATOR_LOG_PREFIX, logName.DEPLOY_LOG_ARBITRATOR);
        }
        let zklink = taskArgs.zklink;
        if (zklink === undefined) {
            zklink = readDeployLogField(logName.DEPLOY_ZKLINK_LOG_PREFIX, logName.DEPLOY_LOG_ZKLINK_PROXY);
        }
        let force = taskArgs.force;
        let skipVerify = taskArgs.skipVerify;
        console.log('arbitrator', arbitrator);
        console.log('zklink', zklink);
        console.log('force redeploy all contracts?', force);
        console.log('skip verify contracts?', skipVerify);


        const contractDeployer = new ChainContractDeployer(hardhat);
        await contractDeployer.init();
        const deployerWallet = contractDeployer.deployerWallet;

        const {deployLogPath,deployLog} = createOrGetDeployLog(logName.DEPLOY_ETH_GATEWAY_LOG_PREFIX);
        deployLog[logName.DEPLOY_LOG_GOVERNOR] = deployerWallet.address;
        fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));

        // deploy eth gateway
        let gatewayAddr;
        if (!(logName.DEPLOY_GATEWAY in deployLog) || force) {
            console.log('deploy eth gateway...');
            const contract = await contractDeployer.deployProxy("EthereumGateway", [arbitrator, zklink]);
            const transaction = await getDeployTx(contract);
            gatewayAddr = await contract.getAddress();
            deployLog[logName.DEPLOY_GATEWAY] = gatewayAddr;
            deployLog[logName.DEPLOY_LOG_DEPLOY_TX_HASH] = transaction.hash;
            deployLog[logName.DEPLOY_LOG_DEPLOY_BLOCK_NUMBER] = transaction.blockNumber;
            fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
        } else {
            gatewayAddr = deployLog[logName.DEPLOY_GATEWAY];
        }
        console.log('eth gateway', gatewayAddr);

        let gatewayTargetAddr;
        if (!(logName.DEPLOY_GATEWAY_TARGET in deployLog) || force) {
            console.log('get eth gateway target...');
            gatewayTargetAddr = await getImplementationAddress(
                hardhat.ethers.provider,
                gatewayAddr
            );
            deployLog[logName.DEPLOY_GATEWAY_TARGET] = gatewayTargetAddr;
            fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
        } else {
            gatewayTargetAddr = deployLog[logName.DEPLOY_GATEWAY_TARGET];
        }
        console.log("eth gateway target", gatewayTargetAddr);

        // verify proxy contract
        if ((!(logName.DEPLOY_GATEWAY_VERIFIED in deployLog) || force) && !skipVerify) {
            await verifyContractCode(hardhat, gatewayAddr, []);
            deployLog[logName.DEPLOY_GATEWAY_VERIFIED] = true;
            fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
        }

        // verify target contract
        if ((!(logName.DEPLOY_GATEWAY_TARGET_VERIFIED in deployLog) || force) && !skipVerify) {
            await verifyContractCode(hardhat, gatewayTargetAddr, []);
            deployLog[logName.DEPLOY_GATEWAY_TARGET_VERIFIED] = true;
            fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
        }
    });

task("upgradeETHGateway","Upgrade ETH gateway")
    .addParam("skipVerify", "Skip verify", false, types.boolean, true)
    .setAction(async (taskArgs,hardhat)=>{
        let skipVerify = taskArgs.skipVerify;
        console.log("skipVerify", skipVerify);

        const { deployLogPath, deployLog } = createOrGetDeployLog(logName.DEPLOY_ETH_GATEWAY_LOG_PREFIX);
        const contractAddr = deployLog[logName.DEPLOY_GATEWAY];
        if (contractAddr === undefined) {
            console.log('eth gateway address not exist');
            return;
        }
        console.log('eth gateway', contractAddr);
        const oldContractTargetAddr = deployLog[logName.DEPLOY_GATEWAY_TARGET];
        if (oldContractTargetAddr === undefined) {
            console.log('eth gateway target address not exist');
            return;
        }
        console.log('eth gateway old target', oldContractTargetAddr);

        const contractDeployer = new ChainContractDeployer(hardhat);
        await contractDeployer.init();

        console.log("upgrade eth gateway...");
        const contract = await contractDeployer.upgradeProxy("EthereumGateway", contractAddr);
        const tx = await getDeployTx(contract);
        console.log('upgrade tx', tx.hash);
        const newContractTargetAddr = await getImplementationAddress(hardhat.ethers.provider, contractAddr);
        deployLog[logName.DEPLOY_GATEWAY_TARGET] = newContractTargetAddr;
        console.log("eth gateway new target", newContractTargetAddr);
        fs.writeFileSync(deployLogPath,JSON.stringify(deployLog, null, 2));

        if (!skipVerify) {
            await verifyContractCode(hardhat, newContractTargetAddr, []);
            deployLog[logName.DEPLOY_GATEWAY_TARGET_VERIFIED] = true;
            fs.writeFileSync(deployLogPath,JSON.stringify(deployLog, null, 2));
        }
    });