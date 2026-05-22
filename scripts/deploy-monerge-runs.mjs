import fs from 'node:fs/promises';
import path from 'node:path';
import solc from 'solc';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const root = process.cwd();
const contractPath = path.join(root, 'contracts', 'MonergeRuns.sol');
const rpcUrl = process.env.MONAD_RPC_URL || 'https://rpc.monad.xyz';
const privateKey = process.env.MONAD_DEPLOYER_PRIVATE_KEY || '';
const monadMainnet = {
  id: 143,
  name: 'Monad Mainnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  blockExplorers: { default: { name: 'MonadScan', url: 'https://monadscan.com' } }
};

if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
  throw new Error('Set MONAD_DEPLOYER_PRIVATE_KEY to a funded deployer private key.');
}

const source = await fs.readFile(contractPath, 'utf8');
const input = {
  language: 'Solidity',
  sources: {
    'MonergeRuns.sol': { content: source }
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode.object']
      }
    }
  }
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = output.errors?.filter((error) => error.severity === 'error') || [];
if (errors.length) {
  throw new Error(errors.map((error) => error.formattedMessage).join('\n'));
}

const artifact = output.contracts['MonergeRuns.sol'].MonergeRuns;
const account = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain: monadMainnet, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: monadMainnet, transport: http(rpcUrl) });

console.log(`Deploying MonergeRuns from ${account.address} on ${monadMainnet.name}...`);
const hash = await walletClient.deployContract({
  abi: artifact.abi,
  bytecode: `0x${artifact.evm.bytecode.object}`
});
console.log(`Transaction: ${hash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log(`Contract: ${receipt.contractAddress}`);
console.log(`Explorer: https://monadscan.com/address/${receipt.contractAddress}`);
console.log('');
console.log(`Set VITE_MONERGE_RUNS_CONTRACT=${receipt.contractAddress}`);
