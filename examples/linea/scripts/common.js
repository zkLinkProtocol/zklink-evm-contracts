const { LineaSDK, OnChainMessageStatus } = require('@consensys/linea-sdk');

function initSDK() {
  const walletPrivateKey = process.env.DEVNET_PRIVKEY;
  const ethereumName = process.env.ETHEREUM;
  const sdk = new LineaSDK({
    l1RpcUrl: process.env.L1RPC ?? '',
    l2RpcUrl: process.env.L2RPC ?? '',
    l1SignerPrivateKey: walletPrivateKey ?? '',
    l2SignerPrivateKey: walletPrivateKey ?? '',
    network: ethereumName === 'GOERLI' ? 'linea-goerli' : ethereumName === 'SEPOLIA' ? 'localhost' : 'linea-mainnet', // sdk not support SEPOLIA
    mode: 'read-write',
  });
  const sepoliaContracts = {
    l1ContractAddress: '0xB218f8A4Bc926cF1cA7b3423c154a0D627Bdb7E5',
    l2ContractAddress: '0x971e727e956690b9957be6d51Ec16E73AcAC83A7',
  };
  const lineaL1Contract = sdk.getL1Contract(sepoliaContracts.l1ContractAddress);
  const lineaL2Contract = sdk.getL2Contract(sepoliaContracts.l2ContractAddress);
  const lineaL1ClaimingService = sdk.getL1ClaimingService(
    sepoliaContracts.l1ContractAddress,
    sepoliaContracts.l2ContractAddress,
  );
  return { lineaL1Contract, lineaL2Contract, lineaL1ClaimingService };
}

async function claimL1ToL2Message(l1TxHash, messageIndex) {
  const sdkInit = initSDK();
  const lineaL1Contract = sdkInit.lineaL1Contract;
  const lineaL2Contract = sdkInit.lineaL2Contract;

  /**
   * Query the transaction status on L2 via messageHash.
   */
  messageIndex = messageIndex ?? 0;
  const messages = await lineaL1Contract.getMessagesByTransactionHash(l1TxHash);
  const message = messages[messageIndex];

  // Waiting for the official Linea bridge to forward the message to L2
  // And manually claim the message on L2
  /*eslint no-constant-condition: ["error", { "checkLoops": false }]*/
  while (true) {
    const messageStatus = await lineaL2Contract.getMessageStatus(message.messageHash);
    console.log(`The message status: ${messageStatus}`);
    if (messageStatus === OnChainMessageStatus.CLAIMABLE) {
      const tx = await lineaL2Contract.claim(message);
      console.log(`The tx hash: ${tx.hash}`);
      await tx.wait();
      console.log(`The tx confirmed`);
      break;
    }
    await sleep(60 * 1000);
  }
}

async function claimL2ToL1Message(l2TxHash) {
  const sdkInit = initSDK();
  const lineaL1ClaimingService = sdkInit.lineaL1ClaimingService;
  const lineaL2Contract = sdkInit.lineaL2Contract;

  /**
   * Query the message informations on L2 via txHash.
   */
  const message = (await lineaL2Contract.getMessagesByTransactionHash(l2TxHash)).pop();
  console.log(`The messageSender: ${message.messageSender}`);
  console.log(`The destination: ${message.destination}`);
  console.log(`The fee: ${message.fee}`);
  console.log(`The value: ${message.value}`);
  console.log(`The messageNonce: ${message.messageNonce}`);
  console.log(`The calldata: ${message.calldata}`);
  console.log(`The messageHash: ${message.messageHash}`);

  // Waiting for the official Linea bridge to forward the message to L1
  // And manually claim the message on L1
  /*eslint no-constant-condition: ["error", { "checkLoops": false }]*/
  while (true) {
    /**
     * Query the transaction status on L1 via messageHash.
     */
    const messageStatus = await lineaL1ClaimingService.getMessageStatus(message.messageHash);
    console.log(`The message status: ${messageStatus}`);
    if (messageStatus === OnChainMessageStatus.CLAIMABLE) {
      const tx = await lineaL1ClaimingService.claimMessage(message);
      console.log(`The tx hash: ${tx.hash}`);
      await tx.wait();
      console.log(`The tx confirmed`);
      break;
    }
    await sleep(60 * 1000 * 30);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  claimL1ToL2Message,
  claimL2ToL1Message,
};
