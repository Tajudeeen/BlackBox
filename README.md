# BLACKBOX

A confidential prediction market protocol powered by Zama Fully Homomorphic Encryption.

Your prediction, your amount, and your outcome share are encrypted end to end — visible only to you, never to other participants, never to the chain.

**Live demo:** [black-box-zama.vercel.app](https://black-box-zama.vercel.app)

Built for the Zama FHE Developer Program — Mainnet Season 3, Builder Track.

---

## Try it now

1. Open [black-box-zama.vercel.app](https://black-box-zama.vercel.app)
2. Get free Sepolia ETH from [sepoliafaucet.com](https://sepoliafaucet.com)
3. Connect MetaMask on the Sepolia network
4. Open any market, pick an outcome, enter an amount, hit **Encrypt and submit**
5. After the market resolves, return to the same page and claim your result privately

No mainnet ETH required. All activity is on Sepolia testnet.

---

## What it is

Public blockchains expose every position the moment it lands on chain. Other participants can see what you predicted, how much you committed, and which way the market is leaning — before it even settles.

BLACKBOX removes that entirely. Predictions go on chain as ciphertext. The smart contract runs settlement logic directly on encrypted values using Zama FHE. Your outcome is computed without the contract ever seeing what you chose.

---

## How a market works

**Creation**

The simulation engine creates a virtual sporting event and opens markets for it. Before markets open, the engine commits to a secret random seed by publishing only its hash on-chain. The actual seed stays hidden until after markets close. Anyone can verify afterward that the engine did not change the outcome after seeing positions.

**Submission**

You connect your wallet, pick an outcome, and enter an amount. The Zama SDK encrypts both values in a Web Worker inside your browser. Only ciphertext reaches the network — never your actual choice or amount.

**Resolution**

When the market closes, the engine reveals the seed, recomputes the outcome deterministically, and submits it on-chain. Anyone can re-run the same computation from the revealed seed and verify the result.

**Claiming**

You call claim. The contract computes your encrypted outcome share using `FHE.eq` and `FHE.select` — entirely on ciphertext. You sign a free wallet signature to authorize decryption. The Zama relayer sends the result back to your browser only.

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
frontend/     Next.js + wagmi + RainbowKit + Zama React SDK  →  Vercel
backend/      Node.js simulation engine + Postgres             →  Railway
contracts/    BlackboxMarket.sol (Hardhat + Zama fhEVM)        →  Ethereum Sepolia
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
4. Set environment variables:

```
RPC_URL=
OPERATOR_PRIVATE_KEY=
MARKET_CONTRACT_ADDRESS=
CLOSING_IN_SECONDS=300
POLL_INTERVAL_MS=15000
```

5. Set build command: `npm install && npm run build`
6. Set start command: `npm start`

### Deploy the contract → Sepolia

```bash
cd contracts
npx hardhat vars set MNEMONIC
npx hardhat deploy --network sepolia
```

Use the printed `BlackboxMarket contract` address for `MARKET_CONTRACT_ADDRESS` in both frontend and backend.

---

## Security

The full adversarial audit is in [SECURITY.md](./SECURITY.md). Key points:

- Encrypted input proofs are bound to `msg.sender` — one user cannot replay another's submission
- `claim()` uses a single `FHE.eq` comparison against the already-known plaintext winning outcome, not a loop — 46.8% gas reduction verified against the old implementation
- The simulation engine's `settleFixture` is idempotent — safe to retry after a partial failure without hitting `MarketAlreadyResolved`
- The operator key is a trusted role with no dispute window — documented in `BlackboxMarket.sol`'s NatSpec and in SECURITY.md

---

## Terminology

This project does not use "bet", "stake", or "gamble" anywhere in the code or copy. The vocabulary: **position, prediction amount, market participation, outcome share.** This is confidential prediction infrastructure, not a gambling product.

---

## License

BSD 3-Clause Clear — see [LICENSE](./LICENSE).

Built by [Deeen_Codes](https://twitter.com/Deeen_Codes) · Powered by [Zama FHE](https://docs.zama.ai)
