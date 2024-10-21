// NOTE: this script is to deploy symbiotic contracts on holesky network, just for TEST!
// It includes deploying vault and delegator, initializing them, minting ERC20 token and depositing it to the vault.
const { task } = require('hardhat/config');
const RPC_URL = 'https://ethereum-holesky-rpc.publicnode.com';
// 0xbF8DB80846D7e58E49A537220862c5A4654357Ee
const PRIVATE_KEY = '6e647734210487a353993228cdf478a2b2864aa247ef982a2208a8113f8189c2';
const ACCOUNT = '0xbF8DB80846D7e58E49A537220862c5A4654357Ee';
const NETWORK = ACCOUNT;
// https://docs.symbiotic.fi/deployments
const VAULT_FACTORY_ADDRESS = '0x5035c15F3cb4364CF2cF35ca53E3d6FC45FC8899';
const DELEGATOR_FACTORY_ADDRESS = '0x2c0A684Ed41AD2CD1B0C783d8edCa868994Eb54b';
const ERC20_ADDRESS = '0x0469760d321d08ab4fce75e2e799902c9f55da59';
const NETWORK_REGISTRY_ADDRESS = '0x5dEA088d2Be1473d948895cc26104bcf103CEf3E';
const OPERATOR_REGISTRY_ADDRESS = '0xa02C55a6306c859517A064fb34d48DFB773A4a52';
const VAULT_OPTIN_SERVICE_ADDRESS = '0x63E459f3E2d8F7f5E4AdBA55DE6c50CbB43dD563';
const NETWORK_OPTIN_SERVICE_ADDRESS = '0x973ba45986FF71742129d23C4138bb3fAd4f13A5';
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
const VAULT_VERSION = 1;
const DELEGATOR_VERSION = 0;

function txHashURL(hash) {
  return `https://holesky.etherscan.io/tx/${hash}`;
}

function addressURL(address) {
  return `https://holesky.etherscan.io/address/${address}`;
}

async function deployVault(hre, signer, version, owner, withInitialize, data) {
  console.log('>>> creating vault...');
  const ethers = hre.ethers;
  const abi = [
    'function implementation(uint64 version) view returns (address)',
    'function create(uint64 version, address owner, bool withInitialize, bytes calldata data) external returns (address)',
    'event AddEntity(address indexed entity)',
  ];
  const contract = new ethers.Contract(VAULT_FACTORY_ADDRESS, abi, signer);
  const tx = await contract.create(version, owner, withInitialize, data);
  console.log('generate tx: ', txHashURL(tx.hash));
  const receipt = await tx.wait();
  const event = receipt.logs
    .filter(log => log.constructor.name === 'EventLog')
    .map(log => contract.interface.parseLog(log))
    .find(parsedLog => parsedLog.name === 'AddEntity');
  const vaultAddress = event?.args.entity;
  console.log('create new vault on', addressURL(vaultAddress));
  if (vaultAddress == undefined) {
    throw new Error('vault address is undefined');
  }
  console.log('<<< creating vault done');
  return vaultAddress;
}

async function deployDelegator(hre, signer, version, withInitialize, data) {
  console.log('>>> creating delegator...');
  const ethers = hre.ethers;
  const abi = [
    'function create(uint64 version, bool withInitialize, bytes calldata data) external returns (address)',
    'event AddEntity(address indexed entity)',
  ];
  const contract = new ethers.Contract(DELEGATOR_FACTORY_ADDRESS, abi, signer);
  const tx = await contract.create(version, withInitialize, data);
  console.log('generate tx: ', txHashURL(tx.hash));
  const receipt = await tx.wait();
  const event = receipt.logs
    .filter(log => log.constructor.name === 'EventLog')
    .map(log => contract.interface.parseLog(log))
    .find(parsedLog => parsedLog.name === 'AddEntity');
  const delegatorAddress = event?.args.entity;
  console.log('create new delegator on', addressURL(delegatorAddress));
  if (delegatorAddress == undefined) {
    throw new Error('delegator address is undefined');
  }
  console.log('<<< creating delegator done');
  return delegatorAddress;
}

async function initDelegator(hre, signer, delegatorAddress, owner, vaultAddress) {
  console.log('>>> initing delegator...');
  const ethers = hre.ethers;
  const abi = ['function initialize(bytes calldata data) external'];
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  // Construct params
  // https://holesky.etherscan.io/address/0xf140E40207D21b770fDf17495B24f3f4ED804AAF#code#F1#L213
  // https://holesky.etherscan.io/address/0xf140E40207D21b770fDf17495B24f3f4ED804AAF#code#F2#L185
  // https://holesky.etherscan.io/address/0xf140E40207D21b770fDf17495B24f3f4ED804AAF#code#F4#L33
  //
  // bytes = abi.encode(vaultAddress, initParamsBytes);
  // initParamsBytes = abi.encode(initParams);
  const initParams = {
    baseParams: {
      defaultAdminRoleHolder: owner,
      hook: owner,
      hookSetRoleHolder: owner,
    },
    networkLimitSetRoleHolders: [],
    operatorNetworkSharesSetRoleHolders: [owner],
  };
  const baseParamsType = 'tuple(address defaultAdminRoleHolder,address hook,address hookSetRoleHolder)';
  const networkRestakeDelegatorType = `tuple(${baseParamsType} baseParams,address[] networkLimitSetRoleHolders,address[] operatorNetworkSharesSetRoleHolders)`;
  const initParamsBytes = abiCoder.encode([networkRestakeDelegatorType], [initParams]);
  const bytes = abiCoder.encode(['address', 'bytes'], [vaultAddress, initParamsBytes]);
  const contract = new ethers.Contract(delegatorAddress, abi, signer);
  const tx = await contract.initialize(bytes);
  console.log('generate tx: ', txHashURL(tx.hash));
  const receipt = await tx.wait();
  if (receipt.status !== 1) {
    throw new Error('init delegator failed');
  }
  console.log('<<< init delegator done');
}

async function initVault(hre, signer, delegatorAddress, owner, vaultAddress) {
  console.log('>>> initing vault...');
  const ethers = hre.ethers;
  const abi = ['function initialize(uint64 initialVersion, address owner_, bytes calldata data) external'];
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  // Construct params
  // https://holesky.etherscan.io/address/0x319890e0051f45d7b99c24929b2adef9432553da#code#F1#L293
  // https://holesky.etherscan.io/address/0x319890e0051f45d7b99c24929b2adef9432553da#code#F5#L50
  const initParams = {
    collateral: ERC20_ADDRESS,
    delegator: delegatorAddress,
    slasher: NULL_ADDRESS,
    burner: NULL_ADDRESS,
    epochDuration: 3600,
    depositWhitelist: false,
    defaultAdminRoleHolder: owner,
    depositWhitelistSetRoleHolder: owner,
    depositorWhitelistRoleHolder: owner,
  };
  const initParamsType =
    'tuple(address collateral,address delegator,address slasher,address burner,uint48 epochDuration,bool depositWhitelist,address defaultAdminRoleHolder,address depositWhitelistSetRoleHolder,address depositorWhitelistRoleHolder)';
  const initParamsBytes = abiCoder.encode([initParamsType], [initParams]);
  const contract = new ethers.Contract(vaultAddress, abi, signer);
  const tx = await contract.initialize(VAULT_VERSION, owner, initParamsBytes);
  console.log('generate tx: ', txHashURL(tx.hash));
  const receipt = await tx.wait();
  if (receipt.status !== 1) {
    throw new Error('init delegator failed');
  }
  console.log('<<< init vault done');
}

async function mintERC20AndDeposit(hre, signer, erc20Address, account, vaultAddress) {
  console.log('>>> minting ERC20 Token...');
  const ethers = hre.ethers;
  const erc20Abi = [
    'function mint(address to) public',
    'function approve(address spender, uint256 amount) public returns (bool)',
  ];

  const erc20 = new ethers.Contract(erc20Address, erc20Abi, signer);
  console.log('-------------: ', account);
  const tx1 = await erc20.mint(account);
  console.log('generate tx: ', txHashURL(tx1.hash));
  const receipt1 = await tx1.wait();
  if (receipt1.status !== 1) {
    throw new Error('mint failed');
  }
  console.log('<<< minting ERC20 Token done');
}

async function eRC20ApproveAndDeposit(hre, signer, erc20Address, account, vaultAddress) {
  console.log('>>> approving ERC20 Token...');
  const ethers = hre.ethers;
  const erc20Abi = ['function approve(address spender, uint256 amount) public returns (bool)'];
  const erc20 = new ethers.Contract(erc20Address, erc20Abi, signer);
  const tx2 = await erc20.approve(vaultAddress, 1000);
  console.log('generate tx: ', txHashURL(tx2.hash));
  const receipt2 = await tx2.wait();
  if (receipt2.status !== 1) {
    throw new Error('approve failed');
  }
  console.log('<<< approving ERC20 Token done');

  console.log('>>> deposit ERC20 Token to Vault...');
  const vaultAbi = [
    'function deposit(address onBehalfOf, uint256 amount) external returns (uint256 depositedAmount, uint256 mintedShares)',
  ];
  const vault = new ethers.Contract(vaultAddress, vaultAbi, signer);
  const tx3 = await vault.deposit(account, 1);
  console.log('generate tx: ', txHashURL(tx3.hash));
  const receipt3 = await tx3.wait();
  if (receipt3.status !== 1) {
    throw new Error('deposit failed');
  }
  console.log('<<< deposit ERC20 Token to Vault done');
}

async function register(hre, signer) {
  const ethers = hre.ethers;
  console.log('>>> register operator...');
  const operatorRegistryAbi = [
    'function isEntity(address entity_) public view returns (bool)',
    'function registerOperator() external',
  ];
  const operatorRegistry = new ethers.Contract(OPERATOR_REGISTRY_ADDRESS, operatorRegistryAbi, signer);
  const isEntity = await operatorRegistry.isEntity(ACCOUNT);
  if (!isEntity) {
    const tx = await operatorRegistry.registerOperator();
    console.log('generate tx: ', txHashURL(tx.hash));
    const receipt = await tx.wait();
    if (receipt.status !== 1) {
      throw new Error('register operator failed');
    }
    console.log('register operator');
  } else {
    console.log('operator already registered');
  }
  console.log('<<< register operator done');

  console.log('>>> register network...');
  const networkRegistryAbi = [
    'function isEntity(address entity_) public view returns (bool)',
    'function registerNetwork() external',
  ];
  const networkRegistry = new ethers.Contract(NETWORK_REGISTRY_ADDRESS, networkRegistryAbi, signer);
  const isNetworkEntity = await networkRegistry.isEntity(ACCOUNT);
  if (!isNetworkEntity) {
    const tx = await networkRegistry.registerNetwork();
    console.log('generate tx: ', txHashURL(tx.hash));
    const receipt = await tx.wait();
    if (receipt.status !== 1) {
      throw new Error('register network failed');
    }
    console.log('register network');
  } else {
    console.log('network already registered');
  }
  console.log('<<< register network done');
}

async function optin(hre, signer, vaultAddress) {
  const ethers = hre.ethers;
  console.log('>>> optin network');
  const abi = [
    'function isOptedIn(address who, address where) public view returns (bool)',
    'function optIn(address where) external',
  ];
  const networkOptinService = new ethers.Contract(NETWORK_OPTIN_SERVICE_ADDRESS, abi, signer);
  const isOptedInNetwork = await networkOptinService.isOptedIn(ACCOUNT, NETWORK);
  if (!isOptedInNetwork) {
    const tx = await networkOptinService.optIn(vaultAddress);
    console.log('generate tx: ', txHashURL(tx.hash));
    const receipt = await tx.wait();
    if (receipt.status !== 1) {
      throw new Error('optin failed');
    }
    console.log('optin network');
  } else {
    console.log('network already opted in');
  }
  console.log('<<< optin network done');

  console.log('>>> optin operator');
  const vaultOptinService = new ethers.Contract(VAULT_OPTIN_SERVICE_ADDRESS, abi, signer);
  const isOptedInVault = await vaultOptinService.isOptedIn(ACCOUNT, vaultAddress);
  if (!isOptedInVault) {
    const tx = await vaultOptinService.optIn(vaultAddress);
    console.log('generate tx: ', txHashURL(tx.hash));
    const receipt = await tx.wait();
    if (receipt.status !== 1) {
      throw new Error('optin failed');
    }
    console.log('optin vault');
  } else {
    console.log('vault already opted in');
  }

  console.log('<<< optin operator done');
}

task('deployHoleskySymbiotic', 'Deploy Holesky Symbiotic').setAction(async (taskArgs, hre) => {
  const ethers = hre.ethers;
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);
  const vaultAddress = await deployVault(hre, signer, VAULT_VERSION, ACCOUNT, false, '0x');
  const delegatorAddress = await deployDelegator(hre, signer, DELEGATOR_VERSION, false, '0x');
  await initVault(hre, signer, delegatorAddress, ACCOUNT, vaultAddress);
  await initDelegator(hre, signer, delegatorAddress, ACCOUNT, vaultAddress);
  // const vaultAddress = '0x11B84fDBe3577A92d8e75A95F04Db941d4323583';
  await eRC20ApproveAndDeposit(hre, signer, ERC20_ADDRESS, ACCOUNT, vaultAddress);
  // await register(hre, signer);
  await optin(hre, signer, vaultAddress);
});
