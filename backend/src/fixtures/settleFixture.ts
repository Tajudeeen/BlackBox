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
 * Settles a pending fixture. Idempotent and parallel — checks each
 * market's on-chain resolved status, then resolves all unresolved markets
 * concurrently instead of sequentially. On Sepolia this cuts settlement
 * time from (N × confirmation_time) down to ~1 confirmation time for a
 * fixture with N markets.
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

  // Check on-chain status for all markets simultaneously
  const onChainStatuses = await Promise.all(
    pending.markets.map((m) => deps.chain.getMarket(m.contractMarketId)),
  );

  // Resolve all unresolved markets concurrently — no need to wait for one
  // before starting the next, since they are independent transactions
  await Promise.all(
    pending.markets.map((market, i) => {
      if (!onChainStatuses[i].resolved) {
        return deps.chain.resolveMarket(market.contractMarketId, result.outcomes[i]);
      }
      return Promise.resolve();
    }),
  );

  await revealSimulationEvent(deps.db, {
    fixtureId,
    seedReveal: pending.seedHex,
    outcomeSummary: result.summary,
  });

  await Promise.all(
    pending.markets.map((market) => markMarketSettled(deps.db, market.marketRowId)),
  );

  await forgetPendingFixture(fixtureId, deps.db);

  return { fixtureId, generatorName: generator.name, summary: result.summary };
}
