const { ZkEvmClient, use } = require('@maticnetwork/maticjs');
const { Web3ClientPlugin } = require('@maticnetwork/maticjs-ethers');
const { providers, Wallet, utils } = require('ethers');
const { readDeployContract, getLogName } = require('../../../script/utils');
const logName = require('../../../script/deploy_log_name');
const { task } = require('hardhat/config');

require('dotenv').config();

use(Web3ClientPlugin)
task('syncBatchRoot', 'Forward message to L2').setAction(async (taskArgs, hre) => {
    const walletPrivateKey = process.env.DEVNET_PRIVKEY;
    const l1Provider = new providers.JsonRpcProvider(process.env.L1RPC);
    const l2Provider = new providers.JsonRpcProvider(process.env.L2RPC);
    const zkpolygonName = process.env.ZKPOLYGON;
    const ethereumName = process.env.ETHEREUM;
    const l1Wallet = new Wallet(walletPrivateKey, l1Provider);
    const l2Wallet = new Wallet(walletPrivateKey, l2Provider);

    const l1WalletAddress = await l1Wallet.getAddress();
    console.log(`The l1 wallet address: ${l1WalletAddress}`);
    const l1WalletBalance = utils.formatEther(await l1Wallet.getBalance());
    console.log(`${l1WalletAddress} balance on l1: ${l1WalletBalance} ether`);

    const zkEvmClient = new ZkEvmClient();
    await zkEvmClient.init({
        network: ethereumName === "GOERLI" ? "testnet" : "mainnet",
        version: 'blueberry',
        parent: {
            provider: l1Wallet
        },
        child: {
            provider: l2Wallet
        },
        log: true
    });

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

    const zkLinkAddr = readDeployContract(logName.DEPLOY_ZKLINK_LOG_PREFIX, logName.DEPLOY_LOG_ZKLINK_PROXY, zkpolygonName);
    if (zkLinkAddr === undefined) {
        console.log('zkLink address not exist');
        return;
    }
    console.log(`The zkLink address: ${zkLinkAddr}`);

    const l1GatewayLogName = getLogName(logName.DEPLOY_L1_GATEWAY_LOG_PREFIX, zkpolygonName);
    const zkpolygonL1GatewayAddr = readDeployContract(l1GatewayLogName, logName.DEPLOY_GATEWAY, ethereumName);
    if (zkpolygonL1GatewayAddr === undefined) {
        console.log('zkpolygon l1 gateway address not exist');
        return;
    }
    console.log(`The zkpolygon l1 gateway address: ${zkpolygonL1GatewayAddr}`);

    // pre-execution calldata
    const zkLink = await hre.ethers.getContractAt('DummyZkLink', zkLinkAddr, l2Wallet);
    const zklinkIface = zkLink.interface;
    const blockNumber = await l2Provider.getBlockNumber();
    console.log(`The current block number: ${blockNumber}`);
    const l2LogsRootHash = utils.keccak256(utils.toUtf8Bytes(`L2 logs root hash ${blockNumber}`));
    console.log(`The l2 logs root hash: ${l2LogsRootHash}`);
    const callData = zklinkIface.encodeFunctionData('syncBatchRoot', [blockNumber, l2LogsRootHash, 0]);
    console.log(`The call data: ${callData}`);

    // forward message to L2
    const arbitrator = await hre.ethers.getContractAt('DummyArbitrator', arbitratorAddr, l1Wallet);
    const adapterParams = "0x";
    let tx = await arbitrator.forwardMessage(zkpolygonL1GatewayAddr, 0, callData, adapterParams);
    await tx.wait();
    console.log(`The tx hash: ${tx.hash}`);
    // const txHash = "0xa3e1bcd4d06690d6e28f782c58c2e1864eab5d00b9a944a2630ec0a219552b95";

    /**
     * Wait for the deposit to be confirmed
     */
    const isClaimable = await zkEvmClient.isDepositClaimable(txHash);
    console.log(`The deposit is claimable: ${isClaimable}`);

    /**
     * Claim message
     */
    const logData = await zkEvmClient.bridgeUtil.getBridgeLogData(txHash, true);
    console.log(`The logData: ${JSON.stringify(logData, null, 2)}`);
    const payload = await zkEvmClient.bridgeUtil.buildPayloadForClaim(txHash, true, logData.originNetwork)
    console.log(`The payload: ${JSON.stringify(payload, null, 2)}`);

    // const result = await zkEvmClient.claimMessage(...payload, { returnTransaction: true });
    const claimTx = await zkEvmClient.childChainBridge.claimMessage(payload.smtProof, [], payload.globalIndex, payload.mainnetExitRoot, payload.rollupExitRoot, payload.originNetwork, payload.originTokenAddress, payload.destinationNetwork, payload.destinationAddress, payload.amount, payload.metadata, { returnTransaction: true });
    console.log(`The result: ${JSON.stringify(result, null, 2)}`);

    // Get the receipt
    const rec = await claimTx.getReceipt();
    console.log(`The claim tx receipt: ${JSON.stringify(rec, null, 2)}`);

    // Example txs:
    // https://goerli.etherscan.io/tx/0xa3e1bcd4d06690d6e28f782c58c2e1864eab5d00b9a944a2630ec0a219552b95
    // 
});
