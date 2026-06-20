/**
 * One-shot integration smoke test, NOT part of the engine itself. Creates
 * one fixture, waits for its markets to close, settles it, and verifies
 * the chain and database state afterward. Used to verify Phase 3 end to
 * end against a real local Hardhat node and a real local Postgres
 * instance -- this file is not wired into `npm start` or `npm test`.
 */
import "dotenv/config";

import { Pool } from "pg";

import { BlackboxChainClient } from "./chain/client.js";
import { loadConfig } from "./config.js";
import { createFixture } from "./fixtures/runFixture.js";
import { settleFixture } from "./fixtures/settleFixture.js";
import { getPendingFixture } from "./fixtures/pendingStore.js";

async function main() {
  const config = loadConfig();
  const chain = new BlackboxChainClient(config);
  const db = new Pool({ connectionString: config.databaseUrl });
  const deps = { chain, db };

  console.log("--- creating fixture ---");
  const fixture = await createFixture(deps, config.closingInSeconds);
  console.log(fixture);

  const pending = getPendingFixture(fixture.fixtureId);
  if (!pending) throw new Error("fixture not found in pending store immediately after creation");

  const waitMs = (pending.closingTime - Math.floor(Date.now() / 1000) + 2) * 1000;
  console.log(`--- waiting ${waitMs}ms for markets to close ---`);
  await new Promise((resolve) => setTimeout(resolve, Math.max(waitMs, 0)));

  console.log("--- settling fixture ---");
  const settled = await settleFixture(deps, fixture.fixtureId);
  console.log(settled);

  console.log("--- reading back from chain ---");
  const winnerInfo = await chain.getMarket(fixture.contractMarketIds.winner);
  const overUnderInfo = await chain.getMarket(fixture.contractMarketIds.overUnder);
  console.log("winner market:", winnerInfo);
  console.log("over/under market:", overUnderInfo);

  console.log("--- reading back from database ---");
  const marketRows = await db.query("SELECT * FROM markets ORDER BY created_at");
  const eventRows = await db.query("SELECT * FROM simulation_events ORDER BY created_at");
  console.log("markets table:", marketRows.rows);
  console.log("simulation_events table:", eventRows.rows);

  if (!winnerInfo.resolved || !overUnderInfo.resolved) {
    throw new Error("FAIL: markets were not resolved on chain");
  }
  if (winnerInfo.winningOutcome !== settled.result.winnerOutcome) {
    throw new Error("FAIL: on-chain winner outcome does not match the engine's computed outcome");
  }
  if (overUnderInfo.winningOutcome !== settled.result.overUnderOutcome) {
    throw new Error("FAIL: on-chain over/under outcome does not match the engine's computed outcome");
  }
  if (eventRows.rows.length !== 2 || !eventRows.rows.every((r) => r.seed_reveal)) {
    throw new Error("FAIL: simulation_events rows missing or seed not revealed");
  }

  console.log("--- PASS: end-to-end fixture lifecycle verified against live chain and database ---");
  await db.end();
}

main().catch((error) => {
  console.error("SMOKE TEST FAILED", error);
  process.exitCode = 1;
});
