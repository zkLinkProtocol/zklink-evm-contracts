const { Provider, Wallet, utils } = require('zksync-ethers');
const { task, types } = require('hardhat/config');
const { ethers, Interface, Contract, parseUnits } = require('ethers');

require('dotenv').config();

const L2_TOKEN_ABI = [
  'function l2Bridge() external view returns (address)',
  'function name() external view returns (string memory)',
  'function decimals() external view returns (uint8)',
  'function transfer(address to, uint256 amount) external returns (bool)',
];

const L2_ERC20_BRIDGE_ABI = ['function withdraw(address _l1Receiver, address _l2Token, uint256 _amount)'];

task('encodeTransferERC20', 'Encode calldata for transfer erc20 token on nova')
  .addParam('token', 'The l2 token address', undefined, types.string, false)
  .addParam('amount', 'The transfer amount(unit: ether)', undefined, types.string, false)
  .addParam('receiver', 'The transfer receiver', undefined, types.string, false)
  .setAction(async taskArgs => {
    const l2TokenAddress = taskArgs.token;
    const amount = taskArgs.amount;
    const receiver = taskArgs.receiver;
    const l2Provider = new Provider(process.env.L2RPC);

    const l2TokenInterface = new Interface(L2_TOKEN_ABI);
    const l2Token = new Contract(l2TokenAddress, l2TokenInterface, l2Provider);
    const l2TokenName = await l2Token.name();
    const l2TokenDecimals = await l2Token.decimals();
    console.log(`L2 token name: ${l2TokenName}`);
    console.log(`L2 token decimals: ${l2TokenDecimals}`);
    const amountWei = parseUnits(amount, l2TokenDecimals);
    console.log(`Transfer amount in wei: ${amountWei}`);

    const calldata = l2TokenInterface.encodeFunctionData('transfer', [receiver, amountWei]);
    console.log(`Transfer calldata: ${calldata}`);
  });

task('encodeWithdrawERC20', 'Encode calldata for withdraw erc20 token on nova')
  .addParam('token', 'The l2 token address', undefined, types.string, false)
  .addParam('amount', 'The withdraw amount(unit: ether)', undefined, types.string, false)
  .addParam('receiver', 'The withdraw receiver', undefined, types.string, false)
  .setAction(async taskArgs => {
    const l2TokenAddress = taskArgs.token;
    const amount = taskArgs.amount;
    const receiver = taskArgs.receiver;
    const l2Provider = new Provider(process.env.L2RPC);

    const l2TokenInterface = new Interface(L2_TOKEN_ABI);
    const l2Token = new Contract(l2TokenAddress, l2TokenInterface, l2Provider);
    const l2TokenName = await l2Token.name();
    const l2TokenDecimals = await l2Token.decimals();
    console.log(`L2 token name: ${l2TokenName}`);
    console.log(`L2 token decimals: ${l2TokenDecimals}`);
    const amountWei = parseUnits(amount, l2TokenDecimals);
    console.log(`Withdraw amount in wei: ${amountWei}`);

    const l2Bridge = await l2Token.l2Bridge();
    console.log(`L2 erc20 token bridge: ${l2Bridge}`);

    const l2ERC20BridgeInterface = new Interface(L2_ERC20_BRIDGE_ABI);
    const calldata = l2ERC20BridgeInterface.encodeFunctionData('withdraw', [receiver, l2TokenAddress, amountWei]);
    console.log(`Withdraw calldata: ${calldata}`);
  });

task('requestL2Tx', 'Request l2 tx from secondary chain')
  .addParam('senderL1', 'The l1 sender address', undefined, types.string, false)
  .addParam('contractL2', 'The l2 contract address', undefined, types.string, false)
  .addOptionalParam('l2Value', 'The l2 value(unit: wei)', 0, types.int)
  .addOptionalParam('l2GasLimit', 'The l2 gas limit', undefined, types.string)
  .addParam('calldata', 'The l2 calldata', undefined, types.string, false)
  .addParam('refundRecipient', 'The l2 refund recipient', undefined, types.string, false)
  .addOptionalParam('print', 'Print the abi encode data', true, types.boolean)
  .setAction(async (taskArgs, hre) => {
    const senderL1 = taskArgs.senderL1;
    const contractL2 = taskArgs.contractL2;
    const l2Value = BigInt(taskArgs.l2Value);
    let l2GasLimit = taskArgs.l2GasLimit;
    const calldata = taskArgs.calldata;
    const refundRecipient = taskArgs.refundRecipient;
    const print = taskArgs.print;
    const l1Provider = new Provider(process.env.L1RPC);
    const l2Provider = new Provider(process.env.L2RPC);

    const isSenderL1Contract = (await l1Provider.getCode(senderL1)) !== '0x';
    console.log(`Is sender on L1 a contract: ${isSenderL1Contract}`);
    const senderL2 = isSenderL1Contract ? utils.applyL1ToL2Alias(senderL1) : senderL1;
    console.log(`Sender alias on L2: ${senderL2}`);
    // Estimate the gas
    const l2GasLimitRequired = BigInt(
      await l2Provider.estimateL1ToL2Execute({
        contractAddress: contractL2,
        calldata: calldata,
        caller: senderL2,
        l2Value: l2Value,
        factoryDeps: [],
      }),
    );
    if (!l2GasLimit) {
      l2GasLimit = l2GasLimitRequired;
    } else {
      l2GasLimit = BigInt(l2GasLimit);
      if (l2GasLimit < l2GasLimitRequired) {
        console.warn(`L2 gas limit ${l2GasLimit} is smaller than required: ${l2GasLimitRequired}`);
        return;
      }
    }
    // Log the estimated gas
    console.log(`Estimated gas for L1 to L2 operation: ${l2GasLimit}`);

    // Get primary tx gas price
    const zkLink = (await hre.ethers.getContractAt('ZkLink', process.env.ZKLINK_ADDRESS)).connect(l1Provider);
    const primaryTxGasPrice = await zkLink.txGasPrice();
    console.log(`Primary tx gas price: ${ethers.formatUnits(primaryTxGasPrice, 'gwei')} gwei`);

    // Base cost
    const l2GasPerPubdataByteLimit = utils.REQUIRED_L1_TO_L2_GAS_PER_PUBDATA_LIMIT;
    const baseCost = await zkLink.l2TransactionBaseCost(primaryTxGasPrice, l2GasLimit, l2GasPerPubdataByteLimit);
    console.log(`Base cost is ${ethers.formatEther(baseCost)} ether`);
    const msgValue = baseCost + l2Value;
    console.log(`The requestL2Transaction msg value is ${ethers.formatEther(msgValue)} ether`);

    // Call requestL2Transaction
    if (print) {
      const abiEncode = zkLink.interface.encodeFunctionData('requestL2Transaction', [
        contractL2,
        l2Value,
        calldata,
        l2GasLimit,
        l2GasPerPubdataByteLimit,
        [],
        refundRecipient,
      ]);
      console.log(`The requestL2Transaction calldata: ${abiEncode}`);
    } else {
      const wallet = new Wallet(process.env.DEVNET_PRIVKEY, l2Provider, l1Provider);

      const l1Balance = ethers.formatEther(await wallet.getBalanceL1());
      const l2Balance = ethers.formatEther(await wallet.getBalance());
      console.log(`Wallet address is ${wallet.address}`);
      if (wallet.address.toLowerCase() !== senderL1) {
        console.warn(`Wallet address not match`);
        return;
      }
      console.log(`L1 Balance is ${l1Balance}`);
      console.log(`L2 Balance is ${l2Balance}`);
      console.log(`Send a l1 message to l2...`);
      const tx = await zkLink
        .connect(wallet)
        .requestL2Transaction(
          contractL2,
          l2Value,
          calldata,
          l2GasLimit,
          l2GasPerPubdataByteLimit,
          [],
          refundRecipient,
          { value: msgValue },
        );
      console.log(`The tx hash: ${tx.hash} , waiting for confirm...`);
      await tx.wait();
      console.log(`The tx confirmed`);
    }
  });
