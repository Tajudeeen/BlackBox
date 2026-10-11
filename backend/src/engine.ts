import { createFixture, resumeCreation, type FixtureDeps } from './fixtures/runFixture.js';
import { listPendingFixtureIds, getPendingFixture } from './fixtures/pendingStore.js';
import { settleFixture } from './fixtures/settleFixture.js';
import { GENERATORS } from './generators/registry.js';
export type EngineDeps = FixtureDeps;
export type EngineOptions = {closingInSeconds: number};
export async function tick(deps: EngineDeps, options: EngineOptions, nowSeconds: number) {
  for (const fixtureId of listPendingFixtureIds()) {
    try {
      await resumeCreation(deps, fixtureId);
      if (nowSeconds >= getPendingFixture(fixtureId)!.closingTime) await settleFixture(deps, fixtureId);
    } catch { console.error(`[blackbox-backend] fixture ${fixtureId} retained for recovery`); }
  }
  const busy = new Set(listPendingFixtureIds().map(id => getPendingFixture(id)!.generatorName));
  for (const generator of GENERATORS) {
    if (!busy.has(generator.name)) {
      try { await createFixture(deps, generator, options.closingInSeconds); }
      catch { console.error(`[blackbox-backend] ${generator.name} creation failed; retry uses durable intent`); }
    }
  }
}
export async function runEngine(deps: EngineDeps, options: EngineOptions & {pollIntervalMs: number}) {
  while (true) {
    await tick(deps, options, Math.floor(Date.now() / 1000));
    await new Promise(resolve => setTimeout(resolve, options.pollIntervalMs));
  }
}
