# Demonstrating v2 with evidence

Use a fresh Sepolia v2 deployment configured according to `docs/MIGRATION.md`. This repository does not establish that any existing website runs v2.

1. Open a market and inspect its on-chain commitment before entering a prediction.
2. Faucet BBX, approve the market as a token operator, and submit an encrypted prediction.
3. Decrypt the actual deposit. Explain that insufficient balance records zero even if a transaction succeeds.
4. After closing, reveal the seed. Show the public verifier matching both commitment and deterministic result. Download the JSON evidence and run `backend`'s `verify:market` script independently.
5. Claim and decrypt entitlement, actually paid, and still owed. For an underfunded pool, show the unpaid amount, fund the pool with test tokens and retry. Confirm the paid amount changes and a second completed claim adds no payment.
6. Show permissionless cancellation after the reveal deadline and the entitlement to actual principal.

State the limits: operator seed selection/foreknowledge, possible withholding, pooled insolvency, public participation metadata, and production FHE trust. A convincing demo exposes these limits rather than calling a matching seed proof of complete fairness.
