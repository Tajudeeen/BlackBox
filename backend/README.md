# BlackBox v2 backend

Install with `npm ci`; run `npm test` and `npm run build`. Copy the blank `.env.example` and supply fresh configuration privately. Apply `schema.sql` to a private Postgres instance, deploy a fresh v2 market, assign the operator and run `npm start`.

Pending seeds are saved before sending transactions. Stable creation keys support recovery after lost receipts, and failed checkpoints remain pending. The engine serializes writes, takes a database advisory lock and checks the chain/address binding at startup. Legacy v1 tables are not used.

`npm run verify:market -- <id>` is a read-only snapshot verifier needing only RPC_URL and MARKET_CONTRACT_ADDRESS. `npx tsx src/adminResolve.ts <id>` only cancels an expired market; there is no arbitrary-result override.

See the root `docs/PROTOCOL.md`, `docs/MIGRATION.md` and `docs/VERIFICATION.md`. Unit tests inject failures with a database stub; they do not replace a real Postgres integration test.
