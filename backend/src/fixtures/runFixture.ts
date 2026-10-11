import { randomUUID } from 'node:crypto';
import { id } from 'ethers';
import { CreationExpiredError, type ChainClient } from '../chain/client.js';
import type { DbClient } from '../db/types.js';
import { insertMarket } from '../db/markets.js';
import { insertSimulationEvent } from '../db/simulationEvents.js';
import type { Generator } from '../generators/types.js';
import { getGenerator } from '../generators/registry.js';
import { commitSeed, generateSeed } from '../generators/virtualFootball/randomness.js';
import { getPendingFixture, rememberPendingFixture, type PendingFixture } from './pendingStore.js';
export type FixtureDeps = { chain: ChainClient; db: DbClient };
export async function resumeCreation(deps: FixtureDeps, fixtureId: string) {
  const saved = getPendingFixture(fixtureId);
  if (!saved) throw new Error('Missing durable fixture intent');
  let pending: PendingFixture = saved;
  const specs = getGenerator(pending.generatorName).getMarkets();
  const commitment = commitSeed(pending.seedHex);
  for (let i = pending.markets.length; i < specs.length; i++) {
    const spec = specs[i];
    let created;
    try {
      created = await deps.chain.createMarket(spec.eventType, spec.label, pending.closingTime, spec.oddsBps,
        commitment, id(`blackbox:v2:${fixtureId}:${i}`));
    } catch (error) {
      if (error instanceof CreationExpiredError) break;
      throw error;
    }
    const marketRowId = await insertMarket(deps.db, {contractMarketId: created.marketId,
      eventType: spec.eventType, label: spec.label, closingTime: new Date(pending.closingTime * 1000)});
    await insertSimulationEvent(deps.db, {marketRowId, fixtureId, generator: pending.generatorName, seedCommitment: commitment});
    const next: PendingFixture = {...pending, markets: [...pending.markets, {marketRowId, contractMarketId: created.marketId}]};
    await rememberPendingFixture(fixtureId, next, deps.db);
    pending = next;
  }
  return {fixtureId, generatorName: pending.generatorName, commitment, closingTime: pending.closingTime,
    contractMarketIds: pending.markets.map(m => m.contractMarketId)};
}
export async function createFixture(deps: FixtureDeps, generator: Generator, closingInSeconds: number) {
  const fixtureId = randomUUID();
  await rememberPendingFixture(fixtureId, {generatorName: generator.name, seedHex: generateSeed(), markets: [],
    closingTime: Math.floor(Date.now() / 1000) + closingInSeconds}, deps.db);
  return resumeCreation(deps, fixtureId);
}
