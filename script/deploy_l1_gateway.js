const fs = require("fs");
const { getImplementationAddress } = require("@openzeppelin/upgrades-core");
const { verifyContractCode, createOrGetDeployLog, ChainContractDeployer, getDeployTx, readDeployLogField} = require("./utils");
const logName = require("./deploy_log_name");
const {zkLinkConfig} = require("./zklink_config");

task("deployL1Gateway", "Deploy L1 Gateway")
    .addParam("arbitrator", "The arbitrator address (default get from arbitrator deploy log)", undefined, types.string, true)
    .addParam("targetNetwork", "L2 network name", undefined, types.string, false)
    .addParam("force", "Fore redeploy all contracts", false, types.boolean, true)
    .addParam("skipVerify", "Skip verify", false, types.boolean, true)
    .setAction(async (taskArgs, hardhat) => {
        let arbitrator = taskArgs.arbitrator;
        if (arbitrator === undefined) {
            arbitrator = readDeployLogField(logName.DEPLOY_ARBITRATOR_LOG_PREFIX, logName.DEPLOY_LOG_ARBITRATOR);
        }
        let targetNetwork = taskArgs.targetNetwork;
        let force = taskArgs.force;
        let skipVerify = taskArgs.skipVerify;
        console.log('arbitrator', arbitrator);
        console.log('target network', targetNetwork);
        console.log('force redeploy all contracts?', force);
        console.log('skip verify contracts?', skipVerify);

        const l2ChainInfo = zkLinkConfig[targetNetwork];
        if (l2ChainInfo === undefined) {
          console.log('l2 chain info not exist');
          return;
        }
        const l1GatewayInfo = l2ChainInfo.l1Gateway;
        if (l1GatewayInfo === undefined) {
          console.log('l1 gateway info of l2 chain not exist');
          return;
        }

        const l1GatewayLogName = logName.DEPLOY_L1_GATEWAY_LOG_PREFIX + "_" + targetNetwork;
        const { deployLogPath, deployLog } = createOrGetDeployLog(l1GatewayLogName);

        const contractDeployer = new ChainContractDeployer(hardhat);
        await contractDeployer.init();
        const deployerWallet = contractDeployer.deployerWallet;
        deployLog[logName.DEPLOY_LOG_GOVERNOR] = deployerWallet.address;
        fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));

        // deploy l1 gateway
        let gatewayAddr;
        if (!(logName.DEPLOY_GATEWAY in deployLog) || force) {
            console.log('deploy l1 gateway...');
            const { contractName, initializeParams } = l1GatewayInfo;
            const allParams = [arbitrator].concat(initializeParams);
            const contract = await contractDeployer.deployProxy(contractName, allParams);
            const transaction = await getDeployTx(contract);
            gatewayAddr = await contract.getAddress();
            deployLog[logName.DEPLOY_GATEWAY] = gatewayAddr;
            deployLog[logName.DEPLOY_LOG_DEPLOY_TX_HASH] = transaction.hash;
            deployLog[logName.DEPLOY_LOG_DEPLOY_BLOCK_NUMBER] = transaction.blockNumber;
            fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
        } else {
            gatewayAddr = deployLog[logName.DEPLOY_GATEWAY];
        }
        console.log('l1 gateway', gatewayAddr);

        let gatewayTargetAddr;
        if (!(logName.DEPLOY_GATEWAY_TARGET in deployLog) || force) {
          console.log('get l1 gateway target...');
          gatewayTargetAddr = await getImplementationAddress(
              hardhat.ethers.provider,
              gatewayAddr
          );
          deployLog[logName.DEPLOY_GATEWAY_TARGET] = gatewayTargetAddr;
          fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
        } else {
          gatewayTargetAddr = deployLog[logName.DEPLOY_GATEWAY_TARGET];
        }
        console.log("l1 gateway target", gatewayTargetAddr);

        // verify target contract
        if ((!(logName.DEPLOY_GATEWAY_TARGET_VERIFIED in deployLog) || force) && !skipVerify) {
          await verifyContractCode(hardhat, gatewayTargetAddr, []);
          deployLog[logName.DEPLOY_GATEWAY_TARGET_VERIFIED] = true;
          fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
        }

        // verify proxy contract
        if ((!(logName.DEPLOY_GATEWAY_VERIFIED in deployLog) || force) && !skipVerify) {
            await verifyContractCode(hardhat, gatewayAddr, []);
            deployLog[logName.DEPLOY_GATEWAY_VERIFIED] = true;
            fs.writeFileSync(deployLogPath, JSON.stringify(deployLog, null, 2));
        }
    });

task("upgradeL1Gateway","Upgrade l1 gateway")
    .addParam("skipVerify", "Skip verify", false, types.boolean, true)
    .addParam("targetNetwork", "L2 network name", undefined, types.string, false)
    .setAction(async (taskArgs,hardhat)=>{
        let skipVerify = taskArgs.skipVerify;
        let targetNetwork = taskArgs.targetNetwork;
        console.log("skipVerify", skipVerify);
        console.log("targetNetwork", targetNetwork);

        const l2ChainInfo = zkLinkConfig[targetNetwork];
        if (l2ChainInfo === undefined) {
            console.log('l2 chain info not exist');
            return;
        }
        const l1GatewayInfo = l2ChainInfo.l1Gateway;
        if (l1GatewayInfo === undefined) {
            console.log('l1 gateway info of l2 chain not exist');
            return;
        }

        const l1GatewayLogName = logName.DEPLOY_L1_GATEWAY_LOG_PREFIX + "_" + targetNetwork;
        const { deployLogPath, deployLog } = createOrGetDeployLog(l1GatewayLogName);
        const contractAddr = deployLog[logName.DEPLOY_GATEWAY];
        if (contractAddr === undefined) {
            console.log('l1 gateway address not exist');
            return;
        }
        console.log('l1 gateway', contractAddr);
        const oldContractTargetAddr = deployLog[logName.DEPLOY_GATEWAY_TARGET];
        if (oldContractTargetAddr === undefined) {
            console.log('l1 gateway target address not exist');
            return;
        }
        console.log('l1 gateway old target', oldContractTargetAddr);

        const contractDeployer = new ChainContractDeployer(hardhat);
        await contractDeployer.init();

        console.log("upgrade l1 gateway...");
        const contract = await contractDeployer.upgradeProxy(l1GatewayInfo.contractName, contractAddr);
        const tx = await getDeployTx(contract);
        console.log('upgrade tx', tx.hash);
        const newContractTargetAddr = await getImplementationAddress(hardhat.ethers.provider, contractAddr);
        deployLog[logName.DEPLOY_GATEWAY_TARGET] = newContractTargetAddr;
        console.log("l1 gateway new target", newContractTargetAddr);
        fs.writeFileSync(deployLogPath,JSON.stringify(deployLog, null, 2));

        if (!skipVerify) {
            await verifyContractCode(hardhat, newContractTargetAddr, []);
            deployLog[logName.DEPLOY_GATEWAY_TARGET_VERIFIED] = true;
            fs.writeFileSync(deployLogPath,JSON.stringify(deployLog, null, 2));
        }
    });