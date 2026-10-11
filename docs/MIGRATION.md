# Deploying v2

1. Rotate any credentials previously committed in environment examples. Removing values from the current tree does not remove them from git history. Never deploy using those historical values.
2. Install the three packages with their lockfiles and run `npm run verify` at the repository root.
3. Use a fresh market deployment. The deploy script has a new migration ID; confirm the token is the intended faucet-funded BBX token and the contract reports `PROTOCOL_VERSION() == 2`. Publish addresses, chain ID, deployment transaction and source verification before claiming a live v2 release. Do not point new code at an old v1 market.
4. Configure a private Postgres database and apply `backend/schema.sql`. All v2 tables are separate from legacy tables. Existing v1 pending rows are not replayed. The backend binds the database to one chain and market address and takes a single-engine advisory lock.
5. Set the blank backend environment values with fresh secrets. Use the actual v2 operator key, sufficient testnet ETH, and a supported RPC (Sepolia or local Hardhat). Start one engine. Do not expose the private pending-fixture table: it contains unrevealed seeds.
6. Configure the frontend with the Sepolia v2 market address, RPC and WalletConnect project ID. The market's TOKEN getter determines the coin address. Rebuild the frontend after setting public environment values.
7. Exercise the live flow with test tokens: faucet, token operator approval, encrypted prediction, decrypt actual deposit, reveal, verify public seed/result, claim, decrypt paid/remaining, and retry after funding an insufficient pool. Exercise timeout cancellation and principal recovery. Test database outage/restart against real Postgres.

Keep v1 activity separately labeled and accessible via the previous version if needed. No automatic migration of encrypted positions is implemented. V1 seed/output rules differ from v2 and cannot be relabeled as v2 evidence. Review the old contract's own claim risks before interacting with it.

Deployments, real Postgres integration and live FHE relayer behavior have not been validated by the local unit/build checks. No migration, deployment or main-branch merge is performed by this rebuild.
