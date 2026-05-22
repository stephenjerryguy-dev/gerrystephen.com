import fs from 'node:fs/promises';
import path from 'node:path';
import solc from 'solc';

const root = process.cwd();
const contractPath = path.join(root, 'contracts', 'MonergeRuns.sol');
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
const errors = output.errors || [];
errors.forEach((error) => {
  const out = error.severity === 'error' ? console.error : console.warn;
  out(error.formattedMessage);
});
if (errors.some((error) => error.severity === 'error')) process.exit(1);

const artifact = output.contracts['MonergeRuns.sol'].MonergeRuns;
await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
await fs.writeFile(
  path.join(root, 'artifacts', 'MonergeRuns.json'),
  JSON.stringify({
    contractName: 'MonergeRuns',
    abi: artifact.abi,
    bytecode: `0x${artifact.evm.bytecode.object}`
  }, null, 2)
);
console.log('Compiled contracts/MonergeRuns.sol -> artifacts/MonergeRuns.json');
