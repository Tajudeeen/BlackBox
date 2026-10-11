/**
 * BLACKBOX simulation engine -- entry point.
 *
 * Connects to the chain as the BlackboxMarket operator and to Postgres,
 * then runs the engine loop: settling fixtures whose markets have closed,
 * and creating a new fixture (rotating through generators) whenever none
 * is pending.
 */
import "dotenv/config";

import { Pool } from "pg";

import { BlackboxChainClient } from "./chain/client.js";
import { loadConfig } from "./config.js";
import { loadAllPendingFixtures } from "./db/pendingFixtures.js";
import { runEngine } from "./engine.js";
import { loadPendingFixturesIntoMemory } from "./fixtures/pendingStore.js";
import { GENERATORS } from "./generators/registry.js";

async function main() {
  const config = loadConfig();
  const chain = new BlackboxChainClient(config);
  const db = new Pool({ connectionString: config.databaseUrl });

  console.log("[blackbox-backend] simulation engine starting");

  console.log(`[blackbox-backend] market contract: ${config.marketContractAddress}`);
  console.log(`[blackbox-backend] generators: ${GENERATORS.map((g) => g.name).join(", ")}`);
  console.log(`[blackbox-backend] closing in: ${config.closingInSeconds}s`);

  const chainId = await chain.assertReady();
  const lease = await db.connect();
  const locked = await lease.query('SELECT pg_try_advisory_lock(7242082) AS locked');
  if (!locked.rows[0].locked) throw new Error('Another engine owns this database');
  lease.on('error', () => process.exit(1));
  await lease.query('INSERT INTO v2_engine_binding (chain_id, market_address) VALUES ($1, $2) ON CONFLICT DO NOTHING', [chainId, config.marketContractAddress.toLowerCase()]);
  const binding = await lease.query('SELECT chain_id, market_address FROM v2_engine_binding');
  if (binding.rows[0].chain_id !== chainId || binding.rows[0].market_address !== config.marketContractAddress.toLowerCase()) throw new Error('Database is bound to another chain or market contract');

  // Recover any fixtures that were still open when this process last
  // stopped -- without this, a restart silently orphans them (see
  // fixtures/pendingStore.ts for the full explanation).
  const recovered = await loadAllPendingFixtures(db);
  loadPendingFixturesIntoMemory(recovered);
  if (recovered.size > 0) {
    console.log(
      `[blackbox-backend] recovered ${recovered.size} pending fixture(s) from a previous run: ` +
        `${[...recovered.keys()].join(", ")}`,
    );
  }

  await runEngine(
    { chain, db },
    { closingInSeconds: config.closingInSeconds, pollIntervalMs: config.pollIntervalMs },
  );
}

main().catch(() => {
  console.error("[blackbox-backend] startup failed; check configuration, chain and database");
  process.exitCode = 1;
});
