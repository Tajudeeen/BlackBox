# Verification record

Reconstructed and checked on 2026-10-11 against base `91856b589489b6610e27725c66970b54daceefad`, using Node 24.19.0. Previous unpublished workspace commits were unavailable after workspace maintenance. This record covers the reconstructed code on this branch, with freshly executed checks.

## Executed

`npm run verify` completed with exit code 0:

| Check | Result |
| --- | --- |
| Solidity compilation and TypeChain generation | Passed, Solidity 0.8.27, Cancun |
| Generated frontend ABI compared with compiled artifacts | Passed |
| Shared JavaScript protocol copies compared byte-for-byte | Passed |
| Blank credential/configuration examples | Passed |
| Contract tests | 30 passed; 1 upstream Sepolia-only counter test skipped locally |
| Backend tests | 30 passed, including inherited randomness tests |
| Backend TypeScript build | Passed |
| Frontend ESLint | Passed |
| Frontend TypeScript and Next.js production build | Passed |

Production-server HTTP checks returned 200 with HTML and required COOP/COEP isolation headers for `/`, `/markets`, `/markets/0` and `/portfolio`. These checks used blank deployment configuration; they do not prove a wallet or network transaction flow.

## Evidence and limits

| Requirement | Evidence |
| --- | --- |
| Operator cannot choose a different outcome after committing | Wrong-seed, early-reveal and duplicate-reveal tests; Solidity derives the outcome |
| Solidity/JavaScript rules are reproducible | 120 independent packed-keccak Solidity vectors; backend generator parity with shared protocol |
| No position entitlement from an unfunded requested deposit | Insufficient-token test decrypts actual deposit and entitlement as zero |
| Bounded payout multiplication | Encrypted oversize input selects zero; `MAX_AMOUNT * MAX_ODDS_BPS <= 2^64 - 1` by construction |
| A receipt cannot permanently consume an unpaid claim | Insufficient-pool test retains debt, then funds/retries, checks actual wallet balance and prevents duplicate payment |
| Expired markets have a defined exit | Permissionless cancellation/refund tests and reveal deadline rejection |
| Participant ACL isolation | Another participant cannot decrypt deposit, entitlement or payment handles under the mock FHE plugin |
| Creation can resume after interrupted writes | Failure injection for lost receipts, restart, failed checkpoint, expired partial creation and duplicate avoidance |
| Failed deletion does not lose recovery state | Durable and in-memory fixture remain until deletion succeeds; no duplicate resolution |
| A failed generator cannot continuously create new fixtures | Repeated blocked ticks retain one pending intent per generator |

Under the configured token's transfer semantics, `0 <= transferred <= remaining`; each claim updates `paid' = paid + transferred` and `remaining' = remaining - transferred`. Thus `paid + remaining = entitlement` is preserved and repeat claims cannot exceed entitlement. This is a stated invariant with executable examples, not a machine-checked formal proof. It relies on the fixed trusted token's behavior and the FHE stack.

Not executed: real Postgres integration, live Sepolia deployment, live relayer/wallet encryption and decryption, interactive browser QA, production cryptographic validation, independent audit, or formal proof tooling. The CLI verifier and browser result checker require independent live testing against a fresh v2 deployment. CI is configured; this local record does not assert a hosted CI run passed.

## Remaining material risks

The operator can grind seeds, knows outcomes in advance, and can withhold a reveal. The pooled balance has no solvency guarantee, so winners or cancellation refunds can remain unpaid. RPC snapshots are not consensus or source-verification proofs. Historical credentials must be revoked/rotated by the owner. Existing v1 deployments and positions are unchanged.
