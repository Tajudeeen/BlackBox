/**
 * One-off emergency script to manually resolve a market that is stuck
 * because its fixture's seed was lost -- most commonly because it was
 * created before the persistent `pending_fixtures` table existed, or
 * before a schema migration that added it was applied. This bypasses the
 * whole fixture/generator system and calls resolveMarket directly.
 *
 * IMPORTANT: this breaks the commit-reveal fairness guarantee for the
 * specific market you run it against, since you are choosing the outcome
 * manually rather than deriving it from a previously-committed seed.
 * Anyone who submitted a prediction to that market before you run this
 * has no way to verify the outcome was determined honestly. Only use
 * this to unstick a market that has no realistic path to resolving any
 * other way -- not as a routine operational tool.
 *
 * Usage:
 *   npx tsx src/adminResolve.ts <marketId> <winningOutcome>
 *
 * Example -- resolve market 7 with outcome index 1 (e.g. "Draw" for a
 * 3-outcome Winner market, or "Over" for a 2-outcome Over/Under market):
 *   npx tsx src/adminResolve.ts 7 1
 *
 * Requires the same environment variables as the main engine (RPC_URL,
 * OPERATOR_PRIVATE_KEY, MARKET_CONTRACT_ADDRESS) -- run this with the
 * same .env the engine uses, or set them in your shell first.
 */
import "dotenv/config";

import { BlackboxChainClient } from "./chain/client.js";
import { loadConfig } from "./config.js";

async function main() {
  const [marketIdArg, outcomeArg] = process.argv.slice(2);

  if (!marketIdArg || !outcomeArg) {
    console.error("Usage: npx tsx src/adminResolve.ts <marketId> <winningOutcome>");
    process.exit(1);
  }

  const marketId = BigInt(marketIdArg);
  const winningOutcome = Number(outcomeArg);

  if (!Number.isInteger(winningOutcome) || winningOutcome < 0) {
    console.error(`Invalid winningOutcome "${outcomeArg}" -- must be a non-negative integer index.`);
    process.exit(1);
  }

  const config = loadConfig();
  const chain = new BlackboxChainClient(config);

  console.log(`Reading market ${marketId}...`);
  const market = await chain.getMarket(marketId);

  if (!market.exists) {
    console.error(`Market ${marketId} does not exist on this contract.`);
    process.exit(1);
  }
  if (market.resolved) {
    console.log(`Market ${marketId} is already resolved (winning outcome: ${market.winningOutcome}). Nothing to do.`);
    process.exit(0);
  }
  if (winningOutcome >= market.outcomeCount) {
    console.error(
      `winningOutcome ${winningOutcome} is out of range -- this market has ${market.outcomeCount} outcomes (0-${market.outcomeCount - 1}).`,
    );
    process.exit(1);
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds < market.closingTime) {
    console.error(
      `Market ${marketId} has not closed yet (closes at ${new Date(market.closingTime * 1000).toISOString()}). ` +
        `Cannot resolve a market that is still open for predictions.`,
    );
    process.exit(1);
  }

  console.log(`Market: "${market.label}" (${market.eventType})`);
  console.log(`Resolving with winning outcome index ${winningOutcome}...`);

  const txHash = await chain.resolveMarket(marketId, winningOutcome);
  console.log(`Done. Transaction: ${txHash}`);
}

main().catch((error) => {
  console.error("Failed:", error);
  process.exitCode = 1;
});
