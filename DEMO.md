# BLACKBOX — 3-minute demo script

A timed walkthrough for judging. Six beats, roughly 30 seconds each. Have a market already created and close to resolving before you start, so beat 5 doesn't mean standing around waiting — see "Before you start" below.

## Before you start

- A `BlackboxMarket` contract deployed on Sepolia, with `NEXT_PUBLIC_MARKET_CONTRACT_ADDRESS` pointed at it.
- The backend engine (`npm run backend:dev`) running against that same contract, so there's at least one real market live.
- Two browser profiles (or two browsers) with a Sepolia-funded test wallet each, so beat 4 can show a second, independent participant if you want to demonstrate that positions stay hidden from each other — optional, but effective if you have the time.
- Ideally, a market created with a short `CLOSING_IN_SECONDS` shortly before you go on, so it resolves naturally partway through the demo instead of needing to wait. If timing doesn't line up, jump to a market that's already resolved for beats 5-6 and frame it as "here's one I submitted to earlier."

---

## 1. The problem (30s)

> "Every prediction market built on a public blockchain has the same flaw: the moment your position lands on chain, everyone can see it. Large positions get front-run or copied before they even settle. A history of positions reveals your strategy to anyone willing to look. That's fine if transparency is the point — it's a dealbreaker if it isn't. If you have a genuine, maybe contrarian, view of an outcome, today there's no way to act on it without broadcasting that view to every other participant, instantly, for free."

## 2. The BLACKBOX solution (30s)

> "BLACKBOX is confidential prediction infrastructure, built on Zama's FHEVM. Markets have fixed, public odds. Everything about an individual participant — what they predicted, how much, and what they end up with — stays encrypted end to end. Not hidden behind a permission check. Encrypted, the whole way through, including while the contract is computing with it."

Show the landing page (`/`). Point at the tagline and the three-step diagram.

## 3. Create a market (20s)

> "Markets come from a generator — right now, a virtual football match. The backend engine commits to a secret random seed before the market even opens, publishes only its hash, and only reveals the actual seed after the market closes. Anyone can check afterward that the engine didn't change its mind."

Show the backend engine's log output (or the `/markets` dashboard) listing a live market: label, status, countdown. Point out that the odds are public but nothing about who's predicted what is visible anywhere on this page.

## 4. Submit an encrypted prediction (40s)

Open a market detail page. Connect a wallet.

> "I'll predict BLACK FC to win, with a prediction amount of 100."

Pick the outcome, enter the amount, hit **Encrypt and submit**.

> "Watch this — the encryption happens right here, in the browser, before anything reaches the network. The transaction that goes out carries ciphertext. Not a hash of my prediction. Not my prediction with a permission flag on it. Ciphertext the contract computes on directly, and can't read."

Let the transaction confirm. Point out the market still shows nothing about your position to anyone else looking at it.

*(Optional, if you have a second wallet: submit a different prediction from it, and point out that neither wallet can see the other's choice, amount, or even whether the other participant predicted the same outcome.)*

## 5. Private settlement (40s)

Once the market has resolved (engine has run `resolveMarket`):

> "The engine resolves the market with the actual outcome — that part's public, it's just a fact about the simulated match. What happens next is the interesting part."

Hit **Claim**.

> "The contract just computed my outcome share — amount times odds if I was right, zero if I wasn't — entirely on encrypted values. It has no idea which one applies to me. It can't decrypt my prediction to find out, and it didn't need to."

Hit **Authorize decryption** (one-time wallet signature), then show the decrypted number appearing.

> "That decryption happened in my browser, authorized by my wallet's signature, talking directly to Zama's relayer. No one else — not another participant, not the backend, not BLACKBOX itself — can produce that number for my position. Only I can."

## 6. Why this matters (20s)

> "This is the part that's actually new: a smart contract that can run real business logic — compare a prediction, compute a payout — on data it never sees in the clear. That's not possible on a transparent chain no matter how clever the access control is, because the data is sitting right there in calldata for anyone to read. FHE changes what's possible to build on a public blockchain in the first place, and a confidential prediction market is one of the more natural cases for it."

---

## If something doesn't cooperate live

- **Market hasn't resolved yet:** switch to a market resolved earlier in setup and say so directly — "I submitted to this one before we started so we wouldn't be standing around waiting on a confirmation."
- **Wrong network:** the app shows a banner with a one-click switch to Sepolia; point at it rather than fighting it off-script.
- **Relayer or RPC hiccup:** fall back to walking through the code instead — `BlackboxMarket.sol`'s `submitPrediction` and `claim` functions are short and the encrypted-arithmetic flow is visible directly in the source, alongside the NatSpec explaining each step.
