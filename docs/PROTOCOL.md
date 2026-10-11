# BlackBox protocol v2

This is a testnet protocol with executable invariants, not a formally verified or independently audited system. It requires a new deployment. No claim is made that an existing website or contract implements this version.

## Public results

Market creation atomically fixes event type, label, closing time, odds, `keccak256(seed)` and a unique creation key. The key maps to market ID plus one, allowing a sender to recover a mined transaction after losing its receipt. Those market fields cannot be edited. Only the operator creates markets; only the owner changes the operator.

Each seed is exactly 32 bytes. Word i is Ethereum keccak256 of the seed followed by i encoded as an unsigned four-byte big-endian integer. Result calculations use integer arithmetic:

| Event | Rule | Outcome indices |
| --- | --- | --- |
| virtual_football_winner | home = word(0) mod 6; away = word(1) mod 6 | home 0, draw 1, away 2 |
| virtual_football_over_under | Same goals; total greater than 2 | under 0, over 1 |
| dog_race_winner | Smallest of words 0 through 5 | Entrant index 0 through 5 |
| horse_race_winner | Smallest of words 0 through 7 | Entrant index 0 through 7 |
| horse_race_place | Entrant 0 among the two smallest scores | no 0, yes 1 |

Tied race scores use the lower entrant index. These rules intentionally replace v1 floating-point sports simulations. Fixed odds are payout multipliers; they are not calibrated probability estimates. The JavaScript implementation lives in `shared/protocol.mjs`; generated copies let the backend and frontend build independently. Solidity implements the same documented rules. Tests compare 120 seeds/event combinations with an independently packed hash reference.

After closing, anyone who knows the seed can reveal it. The contract checks the commitment and computes the result itself. The reveal window is `[closingTime, closingTime + 86400)`. At or after its end, anyone can cancel an unresolved market. Resolved and cancelled are terminal states. Cancellation creates an entitlement to the actual principal, not an arbitrary winning result.

## Confidential accounting

Predictions are encrypted as one input batch, bound to the submitting address and market contract. The token requires an ERC-7984 operator approval. The market restricts odds to 1 through 1,000,000 basis points and encrypted amounts to `floor((2^64 - 1) / 1,000,000)` raw units. Invalid outcome indices or amounts above the bound select zero without revealing which condition failed. The UI accepts whole BBX up to 18,446,744 at six decimals.

The recorded deposit is the encrypted amount returned by `confidentialTransferFrom`, not the amount requested. An insufficient balance can therefore create a submitted position with a zero deposit. Users must decrypt the actual deposit to know what happened.

For a matching prediction, entitlement is `floor(actualDeposit * winningOdds / 10000)`. A nonmatching prediction receives zero. Cancellation entitlement is actualDeposit. The amount bound prevents multiplication overflow under the configured maximum odds.

`claimed` means entitlement has been computed. It does not mean money was paid. Every claim transfers the outstanding amount and updates encrypted `paid` and `remaining` using the token's actual transfer result. An insufficient pool can return zero; the outstanding entitlement remains retryable. A fully paid claim can be retried but transfers zero. Position/payment handles grant the market and participant access; transferring amounts also grants temporary token access. Mock tests exercise cross-user decryption rejection.

## What this does not prove

- The operator chooses the seed, knows results before opening, can search seeds and can withhold reveals. Commit-reveal prevents changing an already committed seed, not biased selection or foreknowledge. Timeouts provide cancellation, not unbiased randomness.
- The pooled token balance has no reserve guarantee, segregated collateral or worst-case liability enforcement. Winners and refunds can remain unpaid. Retryability does not solve insolvency.
- Participation, submitted/claimed flags, addresses and timing are public. Confidentiality depends on the FHE stack, ACLs, wallet and relayer. Ciphertext handles alone are not a privacy proof.
- Mock FHE tests do not prove production cryptography, relayer availability or live network behavior.
- RPC evidence is a snapshot from the selected provider. It is not a consensus light-client proof, finality guarantee or bytecode/source attestation. A code hash identifies the observed deployment but must be compared independently to a trusted build.

## Backend recovery

A private Postgres pending row stores the seed before the first transaction. Each market uses a stable fixture/index creation key. Recovery queries the key first, validates existing fields including odds, then idempotently writes metadata and advances the durable checkpoint. A failed database write never advances the in-memory checkpoint. An expired creation window settles the prefix already created. A failed settlement retains the fixture and blocks further fixtures for that generator.

One advisory-lock connection permits one engine per database. A persistent chain/address binding prevents replaying pending rows against another deployment. Losing that lock connection exits the process. All signer writes are serialized. Independent read calls can run concurrently. Use a private, backed-up database; losing the seed can force timeout cancellation.

The current tests use a database stub for failure injection. Real Postgres, RPC ambiguity/reorganizations and deployment behavior need integration validation before a live release.
