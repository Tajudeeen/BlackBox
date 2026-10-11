# BLACKBOX

Confidential prediction markets with publicly checkable virtual results, built on Zama FHE and ERC-7984. This branch is protocol v2 and requires a new contract deployment.

V2 commits the result seed on chain at market creation, computes revealed results in Solidity, supports permissionless timeout cancellation, records actual confidential deposits, and keeps unpaid claims retryable. The UI distinguishes entitlement from actual payment and exports public result evidence.

BBX is a faucet-funded testnet token. This is not an independently audited, formally verified or production-ready financial system. The operator can choose biased seeds and knows results before users. Payouts and refunds depend on a shared pool with no solvency guarantee. See [protocol and trust boundaries](docs/PROTOCOL.md).

## Reproduce checks

Use Node 22 or later. The three packages have independent lockfiles:

```sh
npm --prefix contracts ci
npm --prefix backend ci
npm --prefix frontend ci
npm run verify
```

The verification command compiles contracts, checks generated ABI/protocol files and blank environment examples, runs contract and backend tests, builds the backend, and lints/builds the frontend. GitHub Actions runs the same command. See [verification record](docs/VERIFICATION.md) for what was actually exercised and what remains untested.

## Layout

- `contracts`: confidential token, committed-result markets, adversarial tests.
- `shared`: deterministic integer protocol specification in JavaScript.
- `backend`: durable fixture intents, idempotent creation recovery, reveal/cancel settlement, read-only verifier.
- `frontend`: Sepolia interface, local result checks, evidence exports, decrypted actual deposit/payment details.

## Run or migrate

Follow [migration instructions](docs/MIGRATION.md). Existing v1 contracts are immutable and are not upgraded by changing these files. The frontend reads Sepolia; local contract testing is supported separately. Configuration templates deliberately contain no credentials or deployed address.

For an existing v2 market, verify without an operator key or database:

```sh
cd backend
# Set RPC_URL and MARKET_CONTRACT_ADDRESS in your environment.
npm run verify:market -- 0
```

A verification match demonstrates commitment/result consistency under the documented rules. It does not demonstrate unbiased randomness, liquidity or an audited deployment.
