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
  console.log(`[blackbox-backend] rpc: ${config.rpcUrl}`);
  console.log(`[blackbox-backend] market contract: ${config.marketContractAddress}`);
  console.log(`[blackbox-backend] generators: ${GENERATORS.map((g) => g.name).join(", ")}`);
  console.log(`[blackbox-backend] closing in: ${config.closingInSeconds}s`);

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

main().catch((error) => {
  console.error("[blackbox-backend] fatal error", error);
  process.exitCode = 1;
});
