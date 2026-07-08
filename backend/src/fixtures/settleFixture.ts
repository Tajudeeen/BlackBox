import type { ChainClient } from "../chain/client.js";
import type { DbClient } from "../db/types.js";
import { markMarketSettled } from "../db/markets.js";
import { revealSimulationEvent } from "../db/simulationEvents.js";
import { getGenerator } from "../generators/registry.js";
import { forgetPendingFixture, getPendingFixture } from "./pendingStore.js";

export type FixtureDeps = {
  chain: ChainClient;
  db: DbClient;
};

export type SettledFixture = {
  fixtureId: string;
  generatorName: string;
  summary: string;
};

/**
 * Settles a pending fixture. Idempotent -- checks each market's on-chain
 * resolved status before calling resolveMarket, so it's safe to retry
 * after a partial failure without hitting MarketAlreadyResolved.
 */
export async function settleFixture(deps: FixtureDeps, fixtureId: string): Promise<SettledFixture> {
  const pending = getPendingFixture(fixtureId);
  if (!pending) {
    throw new Error(`No pending fixture "${fixtureId}" known to this engine instance`);
  }

  const generator = getGenerator(pending.generatorName);
  const result = generator.simulate(pending.seedHex);

  if (result.outcomes.length !== pending.markets.length) {
    throw new Error(
      `Generator "${generator.name}" returned ${result.outcomes.length} outcomes for ` +
        `${pending.markets.length} markets -- these must match`,
    );
  }

  // Resolve each market. Skip ones already resolved (idempotency).
  for (let i = 0; i < pending.markets.length; i++) {
    const market = pending.markets[i];
    const winningOutcome = result.outcomes[i];
    const onChainInfo = await deps.chain.getMarket(market.contractMarketId);
    if (!onChainInfo.resolved) {
      await deps.chain.resolveMarket(market.contractMarketId, winningOutcome);
    }
  }

  await revealSimulationEvent(deps.db, {
    fixtureId,
    seedReveal: pending.seedHex,
    outcomeSummary: result.summary,
  });

  for (const market of pending.markets) {
    await markMarketSettled(deps.db, market.marketRowId);
  }

  forgetPendingFixture(fixtureId);

  return { fixtureId, generatorName: generator.name, summary: result.summary };
}
