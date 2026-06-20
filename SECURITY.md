# BLACKBOX — Phase 5 security and improvements audit

Scope: `contracts/contracts/BlackboxMarket.sol`, the backend simulation engine (`backend/src`), the frontend (`frontend/src`), and supporting infrastructure (`backend/docker-compose.yml`, `backend/schema.sql`, CI config, dependency trees). Reviewed adversarially across authentication and authorization, input handling, data security, business logic and failed-transaction handling, infrastructure configuration, and dependencies, then checked for chains where smaller issues compound into bigger ones. Every fix below was re-verified against the real test suites, real builds, and a real local chain + database after the change, not just reasoned about on paper.

## 1. Vulnerability summary

| Severity | Count | Status |
|---|---|---|
| High | 2 | Fixed |
| Medium | 1 (gas efficiency, not a vulnerability) | Fixed |
| Low | 4 | Fixed |
| Informational | 4 | Reviewed, accepted by design or documented as monitored risk |

Nothing in this review rose to Critical. Nothing found involved a way for one participant to see, alter, or steal another participant's prediction, amount, or outcome share -- the confidentiality core of the protocol held up under adversarial review. What did break was failure-mode handling in the backend, and some gas and UX rough edges.

## 2. Detailed findings

### 2.1 [High] `settleFixture` was not safe to retry after a partial failure

**Component:** `backend/src/fixtures/settleFixture.ts`

**Description:** Settlement resolves two on-chain markets (Winner, then Over/Under) and then writes the result to Postgres before forgetting the fixture from the in-memory pending store. If anything failed partway -- the second `resolveMarket` call hitting a dropped RPC connection, say -- the function threw, the fixture stayed "pending," and the next engine tick retried the whole function from the top.

**Exploitation scenario:** Operator's RPC provider has a transient blip exactly between the two `resolveMarket` calls. Winner market resolves successfully on chain; Over/Under does not. The fixture stays pending. Next tick, the engine calls `settleFixture` again, which calls `resolveMarket` on the *already-resolved* winner market first -- `BlackboxMarket`'s own `MarketAlreadyResolved` check reverts that call, the function throws again before ever reaching the Over/Under market, and this repeats on every tick forever. The Over/Under market is never resolved through the normal path; participants who predicted on it can never claim.

**Impact:** A market becomes permanently stuck, unresolvable except by manual operator intervention, triggered purely by an ordinary infrastructure hiccup -- no attacker required.

**Fix:** `settleFixture` now checks each market's on-chain `resolved` status before calling `resolveMarket` on it, making the whole function idempotent: safe to call any number of times from any partially-completed state. Verified with four new tests in `settleFixture.test.ts`, including one that asserts a market already resolved from a simulated prior attempt is *not* called again, while the genuinely-unresolved one still is.

### 2.2 [High] `createFixture` could silently orphan on-chain markets, and retry into creating more

**Component:** `backend/src/fixtures/runFixture.ts`, `backend/src/engine.ts`

**Description:** Fixture creation calls `createMarket` twice (Winner, then Over/Under) and only called `rememberPendingFixture` -- the only thing that makes the engine aware a fixture exists at all -- after both succeeded and both database rows were written. A failure between the two `createMarket` calls, or between the second one and the database writes, left an on-chain market that nothing tracked anywhere.

**Exploitation scenario:** Same kind of transient RPC failure as 2.1, this time between the two `createMarket` calls. The Winner market now exists on chain -- and is visible to every user of the frontend, since `/markets` enumerates every market by id with no awareness of which ones the backend "knows about" -- but the engine has no record of it. Worse: since nothing was remembered, the engine sees zero pending fixtures on the next tick and tries to create a *new* one from scratch. If the underlying failure is sticky (a misconfigured RPC endpoint, an operator wallet that's nearly out of gas), this repeats every tick, creating a new orphaned, permanently-unresolvable market each time. Any participant who submits a prediction into one of these markets has no path to ever resolve or claim it.

**Impact:** Unbounded accumulation of dead, user-facing markets under a recurring infrastructure failure; real user predictions stranded with no resolution path.

**Fix:** `createFixture` now throws a dedicated `PartialFixtureCreationError` carrying the id(s) of whatever was already created on chain when it fails partway. `engine.ts`'s `tick` catches that specific error, logs the orphaned market id(s) with clear next steps, and halts further automatic fixture creation until an operator clears it (`resetCreationHalt`) -- typically by restarting the process after addressing the root cause. This caps the damage at one orphaned market per root-cause failure instead of one per tick forever. Every other kind of error still retries normally on the next tick, unaffected. Verified with new tests in `engine.test.ts` confirming a second tick after a halt does not call `createMarket` again.

### 2.3 [Medium, efficiency] `claim()` did `O(outcomeCount)` encrypted comparisons where `O(1)` produces the identical result

**Component:** `contracts/contracts/BlackboxMarket.sol`

**Description:** The original `claim()` looped over every possible outcome, doing an `FHE.eq` and `FHE.select` per iteration, to reconstruct "the odds for whatever the participant predicted" entirely in encrypted arithmetic. This was unnecessary: by the time a market can be claimed against, `winningOutcome` is already plaintext (set in `resolveMarket`), so the only fact that needs to come from an encrypted comparison is whether the participant's encrypted prediction equals that already-known plaintext value. The odds for the winning outcome are then a plain, public array read -- no encryption needed at all, and if the prediction doesn't match, the result is multiplied by zero regardless of what those odds were.

**Verification:** Proved the two versions produce identical output by exhaustive comparison in Python across every (predicted outcome, winning outcome, amount) combination, including out-of-range predicted outcomes -- zero mismatches. Confirmed behaviorally with the existing 35-test suite, all still passing unchanged. Measured real gas cost before and after with a temporary side-by-side build: **378,719 gas -> 201,552 gas for a 3-outcome market, a 46.8% reduction**, and the new version's cost no longer scales with `outcomeCount` at all (the old version would have gotten worse, not just stayed at 46.8%, on the 8-outcome `MAX_OUTCOMES` case).

**Fix:** Replaced the loop with a single `FHE.eq` against the plaintext winning outcome, a plain array read for that outcome's odds, and the same `FHE.mul` / `FHE.div` / `FHE.select` as before. Full reasoning is documented inline in the function's NatSpec, including why the "out-of-range prediction always loses" property still holds.

### 2.4 [Low] No length bound on `eventType` / `label` strings in `createMarket`

**Component:** `contracts/contracts/BlackboxMarket.sol`

**Description:** `createMarket` is `onlyOperator`, so this isn't an attacker-facing vulnerability today, but a compromised or simply misconfigured operator key could write arbitrarily large strings into permanent contract storage, making every future `getMarket` call and every `MarketCreated` event read needlessly expensive for every downstream consumer (frontend, indexers, explorers) indefinitely.

**Fix:** Added `MAX_STRING_LENGTH` (128 bytes) and a `StringTooLong` revert for both fields. The backend's actual labels (23-49 bytes) are nowhere close to the limit. Three new tests cover over-limit, at-limit, and the existing happy path.

### 2.5 [Low] Prediction amount input had no upper bound

**Component:** `frontend/src/components/prediction-form.tsx`

**Description:** The amount field only checked "is this a finite, positive number." A sufficiently large typed value (e.g. `1e300` -- a normal, finite JavaScript number) would pass that check, convert via `BigInt()` to a precise but astronomically large integer, and only fail once it actually hit the relayer or the contract's `euint64` range limit, with whatever error message that layer happens to produce.

**Fix:** Added an explicit `MAX_PREDICTION_AMOUNT` bound (one trillion units -- generous for any realistic use, comfortably inside both `euint64`'s range and `Number.MAX_SAFE_INTEGER` so no floating-point precision is lost before the `BigInt` conversion), with a specific, immediate inline message ("Amount must be 1,000,000,000,000 or less") distinct from the generic "enter a positive whole number" case.

### 2.6 [Low] Postgres dev container bound to all network interfaces with a hardcoded password

**Component:** `backend/docker-compose.yml`

**Description:** `ports: - "5432:5432"` binds Postgres to every network interface on the host, not just localhost. Combined with the hardcoded `POSTGRES_PASSWORD: blackbox_dev_only`, a machine running this compose file on a network with any inbound exposure (a cloud VM with an open security group, for instance) would have an openly reachable, weakly-credentialed database.

**Fix:** Changed the port mapping to `127.0.0.1:5432:5432` and made the password overridable via a `POSTGRES_PASSWORD` environment variable with the old value retained only as an explicitly-labeled local-dev default, with an inline comment warning against widening the bind without also setting a real password.

### 2.7 [Low] No clear "wrong network" indication when a wallet is connected to a supported-but-irrelevant chain

**Component:** frontend (new: `frontend/src/components/network-banner.tsx`)

**Description:** The wagmi config lists both Sepolia (where the contract actually lives) and the local Hardhat chain (for local contract development) as connectable. RainbowKit's own built-in wrong-network handling only fires for chains *outside* that list -- so a wallet connected to Hardhat looks "supported" to wagmi even though there's no deployed contract there for it to talk to, and the user would just see market reads silently fail or show nothing, with no indication why.

**Fix:** Added a dedicated banner that checks the connected chain against Sepolia specifically (not "is this chain in the wagmi config") and offers a one-click switch via `useSwitchChain` when it doesn't match.

## 3. Reviewed and accepted (not vulnerabilities)

These were investigated in depth and are intentional design properties, not bugs -- recorded here, and in the contract's own NatSpec, so a future reviewer doesn't have to redo the same investigation from scratch.

**Operator trust in `resolveMarket` has no dispute window.** A single trusted operator key resolves every market, with no timelock, challenge period, or on-chain correctness check -- the contract has no way to independently verify a real-world event outcome and doesn't try to. This doesn't affect confidentiality (predictions stay encrypted regardless of operator behavior), but it does mean claim correctness for any given market rests entirely on that one key. Now stated explicitly in `resolveMarket`'s NatSpec rather than left implicit. A production deployment with real value at stake should treat this as a hard requirement for a timelock, multisig, or optimistic dispute mechanism before launch, not an optional hardening step.

**`getPosition` makes `submitted` and `claimed` public for any address.** Anyone can check whether a given wallet participated in a given market. This is deliberate and matches the backend's own `activity_log` table, which records participant addresses by design (see `backend/schema.sql`). The privacy goal of this product is hiding *what* someone predicted and *how much*, not *whether* they participated -- consistent end to end across the contract and the backend.

**Encrypted-input replay across markets by the same submitter.** Traced `FHE.fromExternal` through `Impl.verify` to the actual `IFHEVMExecutor.verifyInput(handle, msg.sender, proof, type)` call in the installed `fhevm-solidity` library: input proofs are bound to the calling address, so one user cannot submit using ciphertext generated for a different address -- cross-user replay is not possible. What *is* possible: the same user reusing their own handle+proof across multiple markets in the same contract, since nothing binds a proof to a specific `marketId` (the FHEVM coprocessor has no concept of `marketId` at all). Not exploitable today, since this contract custodies no value yet (see the contract's design note 4) and `AlreadySubmitted` is still enforced independently per market. Documented in the contract as something that must be re-examined the moment real value custody is added.

**Dependency vulnerabilities with no non-breaking fix available.** Ran `npm audit` across all three packages. Backend: zero vulnerabilities. Contracts: applied the non-breaking `npm audit fix` (55 -> 42 advisories, mostly closing out a `ws` issue); the remainder all require a Hardhat 3.x major upgrade, which risks breaking `@fhevm/hardhat-plugin` compatibility that's been verified working throughout this project -- not worth forcing mid-project. Frontend: a `postcss` advisory's only fix path is downgrading Next.js to 9.x (untenable), and a `ws` advisory transitively pulled in through `viem` -> `@zama-fhe/sdk` currently has no fix at all. None of these are reachable through this app's own code paths (no user-controlled CSS, no raw WebSocket handling in app code) -- recorded here as risks to monitor for upstream fixes, not risks this app's own logic introduces.

## 4. Attack chains

The two High findings (2.1, 2.2) are themselves the most realistic attack chain in this codebase, and it's worth being explicit that no malicious actor is required to trigger it: an ordinary, non-adversarial infrastructure failure (a dropped RPC connection, a brief provider outage) was, before this review, enough to cascade into markets that real participants could submit real predictions into and then never be able to resolve or claim -- the kind of bug that looks inconsequential in isolation ("a transaction failed, it'll retry") but compounds into genuine user harm specifically because retries weren't safe. Both are fixed and covered by new tests asserting the specific compounding behavior doesn't happen anymore.

No chain was found that crosses from a public, non-sensitive read (like `getPosition`'s `submitted`/`claimed` flags) into recovering anything that's supposed to stay confidential -- the FHEVM Access Control List grants in `submitPrediction` and `claim` only ever name `msg.sender`, and that holds up under every angle this review tried against it.

## 5. Secure design recommendations going forward

- **Before any deployment with real value at stake:** add the dispute/timelock mechanism around `resolveMarket` discussed in section 3. This is the single largest remaining trust assumption in the protocol.
- **When confidential token custody is added (the documented Phase 4 design note 4):** revisit whether `marketId` needs to be cryptographically bound into prediction submission, per the replay analysis in section 3 -- the current "not exploitable" conclusion depends on there being nothing of value to duplicate, and that stops being true the moment there is.
- **Consider a durable (not in-memory) store for a pending fixture's secret seed** (already flagged as a known limitation in `backend/src/fixtures/pendingStore.ts`) before running the engine somewhere a restart is more than a minor inconvenience.
- **Revisit the dependency advisories in section 3 periodically** -- specifically whether `@fhevm/hardhat-plugin` has caught up to Hardhat 3.x, and whether `@zama-fhe/sdk`'s `viem` pin has moved past the vulnerable `ws` range -- since both are blocked on upstream, not on anything in this codebase.
