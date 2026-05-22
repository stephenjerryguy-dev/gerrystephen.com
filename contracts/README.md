# Monerge On-Chain Runs

`MonergeRuns.sol` is the Monad proof layer for Monerge. The website can keep using Neon for fast leaderboard reads while connected players also publish a run receipt on Monad.

## Deploy

Use a funded Monad deployer wallet:

```sh
MONAD_DEPLOYER_PRIVATE_KEY=0x... npm run deploy:monerge-contract
```

Optional:

```sh
MONAD_RPC_URL=https://rpc.monad.xyz
```

The script prints the contract address and the `VITE_MONERGE_RUNS_CONTRACT` value to set in Vercel.

## Frontend

After deployment, set this environment variable in Vercel:

```sh
VITE_MONERGE_RUNS_CONTRACT=0xYourContractAddress
```

Then redeploy. Revealed runs will keep saving to Neon and will additionally request a Monad transaction from connected wallets.
