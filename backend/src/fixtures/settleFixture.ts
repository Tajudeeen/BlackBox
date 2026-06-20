import type { ChainClient } from "../chain/client.js";
import type { DbClient } from "../db/types.js";
import { markMarketSettled } from "../db/markets.js";
import { revealSimulationEvent } from "../db/simulationEvents.js";
import { describeOutcome, type MatchResult } from "../generators/virtualFootball/market.js";
import { simulateMatch } from "../generators/virtualFootball/simulate.js";
import { forgetPendingFixture, getPendingFixture } from "./pendingStore.js";

export type FixtureDeps = {
  chain: ChainClient;
  db: DbClient;
};

export type SettledFixture = {
  fixtureId: string;
  result: MatchResult;
  summary: string;
};

/**
 * Settles a previously created fixture: reveals the seed this engine
 * committed to at creation time, recomputes the match outcome from it, and
 * submits that outcome to both on-chain markets. Anyone can redo the
 * `simulateMatch` step themselves once `outcome_summary` and the revealed
 * seed are public, and confirm it matches what was submitted on chain.
 *
 * Idempotent by design, found necessary during the Phase 5 review: if a
 * previous call resolved the winner market on chain but then failed
 * before resolving the over/under market or finishing the database
 * writes (a dropped RPC connection, a restart, anything), the fixture
 * stays pending and `runEngine` will call this again on the next tick.
 * Without checking each market's on-chain status first, that retry would
 * call `resolveMarket` again on the market that already succeeded, which
 * reverts with `MarketAlreadyResolved` -- and since that call happens
 * before the over/under market's call in source order, the revert would
 * stop the retry before it ever reached the market that's still actually
 * unresolved. The fixture would then be stuck retrying the same failing
 * call forever, never making progress on the one thing it still needs to
 * do. Checking `resolved` first, per market, before calling
 * `resolveMarket` avoids that: each market is resolved at most once no
 * matter how many times this function is retried.
 */
export async function settleFixture(deps: FixtureDeps, fixtureId: string): Promise<SettledFixture> {
  const pending = getPendingFixture(fixtureId);
  if (!pending) {
    throw new Error(`No pending fixture "${fixtureId}" known to this engine instance`);
  }

  const result = simulateMatch(pending.seedHex);

  const winnerInfo = await deps.chain.getMarket(pending.contractMarketIds.winner);
  if (!winnerInfo.resolved) {
    await deps.chain.resolveMarket(pending.contractMarketIds.winner, result.winnerOutcome);
  }

  const overUnderInfo = await deps.chain.getMarket(pending.contractMarketIds.overUnder);
  if (!overUnderInfo.resolved) {
    await deps.chain.resolveMarket(pending.contractMarketIds.overUnder, result.overUnderOutcome);
  }

  const summary = describeOutcome(result);
  await revealSimulationEvent(deps.db, {
    fixtureId,
    seedReveal: pending.seedHex,
    outcomeSummary: summary,
  });
  await markMarketSettled(deps.db, pending.marketRowIds.winner);
  await markMarketSettled(deps.db, pending.marketRowIds.overUnder);

  forgetPendingFixture(fixtureId);

  return { fixtureId, result, summary };
}
