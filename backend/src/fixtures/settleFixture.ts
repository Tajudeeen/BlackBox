import type { FixtureDeps } from './runFixture.js';
import { markMarketSettled } from '../db/markets.js';
import { revealSimulationEvent } from '../db/simulationEvents.js';
import { getGenerator } from '../generators/registry.js';
import { commitSeed } from '../generators/virtualFootball/randomness.js';
import { forgetPendingFixture, getPendingFixture } from './pendingStore.js';
export async function settleFixture(deps: FixtureDeps, fixtureId: string) {
  const pending = getPendingFixture(fixtureId);
  if (!pending) throw new Error('No pending fixture');
  const generator = getGenerator(pending.generatorName);
  const result = generator.simulate(pending.seedHex);
  for (let i = 0; i < pending.markets.length; i++) {
    const market = pending.markets[i];
    let state = await deps.chain.getMarket(market.contractMarketId);
    if (!state.exists || state.commitment.toLowerCase() !== commitSeed(pending.seedHex).toLowerCase() ||
        state.eventType !== generator.getMarkets()[i].eventType || state.closingTime !== pending.closingTime) throw new Error('Market does not match durable fixture');
    if (!state.resolved) {
      if (Math.floor(Date.now() / 1000) >= state.closingTime + 86400) await deps.chain.cancelExpired(market.contractMarketId);
      else await deps.chain.resolveMarket(market.contractMarketId, pending.seedHex);
      state = await deps.chain.getMarket(market.contractMarketId);
    }
    if (!state.resolved || (!state.cancelled && state.winningOutcome !== result.outcomes[i])) throw new Error('On-chain result mismatch');
    await markMarketSettled(deps.db, market.marketRowId);
  }
  await revealSimulationEvent(deps.db, {fixtureId, seedReveal: pending.seedHex, outcomeSummary: result.summary});
  await forgetPendingFixture(fixtureId, deps.db);
  return {fixtureId, generatorName: generator.name, summary: result.summary};
}
