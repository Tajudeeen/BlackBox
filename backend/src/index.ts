/**
 * BLACKBOX simulation engine -- entry point.
 *
 * Connects to the chain as the BlackboxMarket operator and to Postgres,
 * then runs the virtual football engine loop forever: settling fixtures
 * whose markets have closed, and creating a new fixture whenever none is
 * pending. See src/engine.ts and src/generators/virtualFootball for the
 * generator itself, and src/fixtures for how a fixture's lifecycle maps
 * onto the contract calls.
 */
import "dotenv/config";

import { Pool } from "pg";

import { BlackboxChainClient } from "./chain/client.js";
import { loadConfig } from "./config.js";
import { runEngine } from "./engine.js";

async function main() {
  const config = loadConfig();
  const chain = new BlackboxChainClient(config);
  const db = new Pool({ connectionString: config.databaseUrl });

  console.log("[blackbox-backend] virtual football engine starting");
  console.log(`[blackbox-backend] rpc: ${config.rpcUrl}`);
  console.log(`[blackbox-backend] market contract: ${config.marketContractAddress}`);

  await runEngine(
    { chain, db },
    { closingInSeconds: config.closingInSeconds, pollIntervalMs: config.pollIntervalMs },
  );
}

main().catch((error) => {
  console.error("[blackbox-backend] fatal error", error);
  process.exitCode = 1;
});
