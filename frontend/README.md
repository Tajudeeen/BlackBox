# BlackBox v2 frontend

`npm ci`, `npm run lint`, `npm run build`. Configure the blank `.env.example` with the new Sepolia v2 market address, RPC and WalletConnect project ID. Then run `npm run dev` or the production build.

The detail page reads public evidence at one block, checks the revealed seed and result with the shared integer rules, and exports JSON. Position details decrypt actual deposit, entitlement, paid and remaining amounts. Entitlement alone is never proof of payment. Market and portfolio reads are paginated.

The ABI is generated from compiled contracts via root `node scripts/sync-abi.mjs`. The shared protocol is copied with `node scripts/sync-protocol.mjs`. Both have `--check` modes in CI. See root documentation for trust boundaries and migration requirements.
