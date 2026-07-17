# BLACKBOX

A confidential prediction market protocol powered by Zama Fully Homomorphic Encryption.

Your prediction, your amount, and your outcome share are encrypted end to end — visible only to you, never to other participants, never to the chain.

**Live demo:** [black-box-zama.vercel.app](https://black-box-zama.vercel.app)

Built for the Zama FHE Developer Program — Mainnet Season 3, Builder Track.

---

## Try it now

1. Open [black-box-zama.vercel.app](https://black-box-zama.vercel.app)
2. Get free Sepolia ETH from [sepoliafaucet.com](https://sepoliafaucet.com) — this pays gas, it isn't the prediction currency
3. Connect MetaMask on the Sepolia network
4. Click **+ Faucet** in the top bar to mint free testnet BBX — the confidential token predictions are made in
5. Open any market, pick an outcome, enter an amount, hit **Encrypt and submit** (first time only: approve BLACKBOX to move your BBX — a one-time signature)
6. After the market resolves, return to the same page and claim your result — paid straight to your BBX balance, decryptable only by you

No mainnet ETH required. All activity is on Sepolia testnet, and BBX has no real-world value.

---

## What it is

Public blockchains expose every position the moment it lands on chain. Other participants can see what you predicted, how much you committed, and which way the market is leaning — before it even settles.

BLACKBOX removes that entirely. Predictions go on chain as ciphertext, backed by real (testnet) value: submitting one escrows your encrypted BBX into the market, and a correct claim pays your encrypted outcome share straight back out. The smart contract runs both the settlement logic and the token movement directly on encrypted values using Zama FHE — your outcome is computed, and your payout is transferred, without the contract ever seeing what you chose or how much you committed.

---

## How a market works

**Creation**

The simulation engine creates a virtual sporting event and opens markets for it. Before markets open, the engine commits to a secret random seed by publishing only its hash on-chain. The actual seed stays hidden until after markets close. Anyone can verify afterward that the engine did not change the outcome after seeing positions.

**Submission**

You connect your wallet, pick an outcome, and enter an amount in BBX — BLACKBOX's confidential token (see [Confidential token](#confidential-token-blackboxcoin) below). The Zama SDK encrypts both values in a Web Worker inside your browser. Only ciphertext reaches the network. The contract escrows your encrypted amount out of your BBX balance into its own — a real token transfer, computed entirely on encrypted values.

**Resolution**

When the market closes, the engine reveals the seed, recomputes the outcome deterministically, and submits it on-chain. Anyone can re-run the same computation from the revealed seed and verify the result.

**Claiming**

You call claim. The contract computes your encrypted outcome share using `FHE.eq` and `FHE.select` — entirely on ciphertext — and pays it straight to your BBX balance via the same confidential token, still without decrypting anything. You sign a free wallet signature to authorize decryption of the result. The Zama relayer sends it back to your browser only.

---

## Confidential token: BlackboxCoin

Predictions carry real value, not an abstract number. `BlackboxCoin.sol` is a confidential fungible token built on [OpenZeppelin's ERC-7984 standard](https://docs.zama.org/protocol/examples/openzeppelin-confidential-contracts/erc7984) — developed jointly with Zama for the fhEVM, not hand-rolled. Balances and transfer amounts are encrypted end to end; only the account holder can decrypt their own balance.

- **Public faucet.** Anyone can mint free testnet BBX once per hour — no external token source needed to try the app.
- **Escrow on submit, payout on claim.** `BlackboxMarket` moves BBX confidentially in both directions, computed entirely on ciphertext (see `BlackboxMarket.sol`'s design notes 4–8 for exactly how, and the honest limitations of doing so).
- **One-time approval required.** Before a wallet's first prediction, it must approve `BlackboxMarket` as an ERC-7984 operator — the frontend prompts for this automatically, once.

Two things worth knowing before relying on this beyond a demo: OpenZeppelin's confidential-contracts library is explicitly not yet covered by their formal audit process or bug bounty, per their own documentation — the right ecosystem-standard choice, not an audited one. And BLACKBOX's token balance is pooled across every market, not reserved per market, the same way a real fixed-odds bookmaker's bankroll works in aggregate — see [SECURITY.md](./SECURITY.md) section 6 for the full writeup, including a real bug this integration surfaced and fixed during testing.

---

## Market generators

Three virtual sports rotate automatically, creating new markets continuously:

| Generator | Markets per fixture |
|---|---|
| Virtual Football (BLACK FC vs GOLD FC) | Winner (home / draw / away) + Over/Under 2.5 goals |
| Virtual Dog Race (6 dogs) | Race winner |
| Virtual Horse Race (8 horses) | Race winner + Does the favourite place (top 2)? |

Each generator uses a commit-reveal randomness model. The simulation is deterministic and independently verifiable from the revealed seed.

---

## Architecture

```
frontend/     Next.js + wagmi + RainbowKit + Zama React SDK       →  Vercel
backend/      Node.js simulation engine + Postgres                →  Railway
contracts/    BlackboxMarket.sol + BlackboxCoin.sol (Hardhat + Zama fhEVM + OpenZeppelin ERC-7984)  →  Ethereum Sepolia
```

The frontend reads market data directly from the chain. The backend is the operator: it creates markets, commits to randomness, and resolves fixtures. Postgres stores only public metadata — predictions never touch the database.

---

## Local development

Requires Node.js 22+.

```bash
git clone https://github.com/yourusername/blackbox
cd blackbox

cd contracts && npm install && cd ..
cd frontend  && npm install && cd ..
cd backend   && npm install && cd ..
```

### Run contracts locally

```bash
cd contracts
npm run chain              # start a local Hardhat node
npm run deploy:localhost   # deploy in a second terminal
```

### Run the frontend

```bash
cp frontend/.env.example frontend/.env.local
# fill in the three NEXT_PUBLIC_ variables (see .env.example)
cd frontend && npm run dev
```

Open `http://localhost:3000`.

### Run the backend engine

```bash
cd backend
docker compose up -d       # start local Postgres
cp .env.example .env
# fill in OPERATOR_PRIVATE_KEY and MARKET_CONTRACT_ADDRESS
npm run dev
```

The engine creates a new market within 15 seconds of starting and rotates through all three generators automatically.

---

## Deploying to production

### Frontend → Vercel

Connect your GitHub repo to Vercel. Set root directory to `frontend`. Add these environment variables in Vercel settings:

```
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
NEXT_PUBLIC_MARKET_CONTRACT_ADDRESS=
NEXT_PUBLIC_RPC_URL=
```

### Backend → Railway

1. Create a new Railway project from your GitHub repo
2. Set the root directory to `backend`
3. Add a PostgreSQL database service — Railway sets `DATABASE_URL` automatically
4. **Run `schema.sql` against that database before starting the backend.** Connect with `psql "$DATABASE_URL" -f schema.sql` (get the connection string from Railway's Postgres service → Connect tab) or paste its contents into Railway's built-in query console. This is required — the `pending_fixtures` table it creates is what lets the engine survive a redeploy without losing markets that are still open. Skipping this step means every fixture open at the moment of a redeploy gets permanently stuck at "awaiting resolution" (see the note below).
5. Set environment variables:

```
RPC_URL=
OPERATOR_PRIVATE_KEY=
MARKET_CONTRACT_ADDRESS=
CLOSING_IN_SECONDS=300
POLL_INTERVAL_MS=15000
```

6. Set build command: `npm install && npm run build`
7. Set start command: `npm start`

**Why markets can get permanently stuck, and how this is prevented:** each fixture's randomness seed must stay secret until the market closes (that's the whole point of the commit-reveal model). The engine keeps that seed in memory, and persists it to the `pending_fixtures` table the moment a fixture is created — so a process restart (any redeploy, crash, or host restart) reloads it from Postgres instead of losing it. On startup the engine logs `recovered N pending fixture(s) from a previous run` when this happens. If you have markets stuck from before this table existed, use `backend/src/adminResolve.ts` to manually resolve them — see that file's header comment for usage and its tradeoffs.

### Deploy the contract → Sepolia

```bash
cd contracts
npx hardhat vars set MNEMONIC
npx hardhat deploy --network sepolia
```

This deploys `BlackboxCoin` first, then `BlackboxMarket` wired to it automatically (see `deploy/BlackboxMarket.ts`'s `dependencies` field). Use the printed `BlackboxMarket contract` address for `MARKET_CONTRACT_ADDRESS` in both frontend and backend — the frontend reads `BlackboxCoin`'s address directly from the deployed market's own `TOKEN()` getter, so there's no second address to configure or keep in sync.

---

## Security

The full adversarial audit is in [SECURITY.md](./SECURITY.md). Key points:

- Encrypted input proofs are bound to `msg.sender` — one user cannot replay another's submission
- `claim()` uses a single `FHE.eq` comparison against the already-known plaintext winning outcome, not a loop — 46.8% gas reduction verified against the old implementation
- The simulation engine's `settleFixture` is idempotent — safe to retry after a partial failure without hitting `MarketAlreadyResolved`
- The operator key is a trusted role with no dispute window — documented in `BlackboxMarket.sol`'s NatSpec and in SECURITY.md
- The confidential token integration (BlackboxCoin) is pooled across markets, not reserved per market — a real, documented limitation, not an oversight, covered in SECURITY.md section 6 along with a real cross-contract ACL bug found and fixed while building it

---

## Terminology

This project does not use "bet", "stake", or "gamble" anywhere in the code or copy. The vocabulary: **position, prediction amount, market participation, outcome share.** This is confidential prediction infrastructure, not a gambling product.

---

## License

BSD 3-Clause Clear — see [LICENSE](./LICENSE).

Built by [Deeen_Codes](https://twitter.com/Deeen_Codes) · Powered by [Zama FHE](https://docs.zama.ai)
