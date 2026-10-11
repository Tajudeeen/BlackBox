# BlackBox v2 contracts

`npm ci`, `npm run compile`, `npm test` run local mock-FHE checks. `BlackboxMarket` v2 requires a new deployment and fixes the public result seed at market creation. Solidity derives results, enforces reveal deadlines and permits timeout cancellation. Encrypted accounting records actual token transfers and preserves unpaid debt for retries.

Use explicit private Hardhat configuration for Sepolia deployment. Sepolia has no default mnemonic. The publicly known local test mnemonic is only for local development.

The token is a faucet-funded test asset. There is no reserve guarantee, independent audit or formal verification. Read the root `docs/PROTOCOL.md` before using or extending this code.
