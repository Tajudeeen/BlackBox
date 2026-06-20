import type { FixtureDeps as RunFixtureDeps } from "./fixtures/runFixture.js";
import { createFixture, PartialFixtureCreationError } from "./fixtures/runFixture.js";
import { listPendingFixtureIds, getPendingFixture } from "./fixtures/pendingStore.js";
import { settleFixture, type FixtureDeps as SettleFixtureDeps } from "./fixtures/settleFixture.js";

export type EngineDeps = RunFixtureDeps & SettleFixtureDeps;

export type EngineOptions = {
  closingInSeconds: number;
};

/**
 * Set once `createFixture` reports that it orphaned an on-chain market
 * (see `PartialFixtureCreationError`). While set, `tick` will not attempt
 * to create another fixture, so a recurring failure orphans at most one
 * market instead of one per tick forever. Cleared by `resetCreationHalt`,
 * which a fixed/restarted engine process calls implicitly by virtue of
 * this being in-memory module state -- a fresh process starts unhalted.
 */
let creationHaltedReason: string | null = null;

export function isCreationHalted(): boolean {
  return creationHaltedReason !== null;
}

export function getCreationHaltReason(): string | null {
  return creationHaltedReason;
}

/** Exposed for tests, and for an operator-triggered manual recovery path. */
export function resetCreationHalt(): void {
  creationHaltedReason = null;
}

/**
 * Settles every pending fixture whose closing time has already passed, as
 * of `nowSeconds`. Takes the current time explicitly so it can be tested
 * without depending on the real clock.
 */
export async function settleDueFixtures(deps: EngineDeps, nowSeconds: number): Promise<string[]> {
  const settled: string[] = [];
  for (const fixtureId of listPendingFixtureIds()) {
    const pending = getPendingFixture(fixtureId);
    if (pending && nowSeconds >= pending.closingTime) {
      await settleFixture(deps, fixtureId);
      settled.push(fixtureId);
    }
  }
  return settled;
}

/**
 * One engine tick: settle anything due, then create a new fixture if there
 * is nothing currently pending. Kept to at most one fixture in flight at a
 * time, by design -- per the Phase 3 brief, "keep simulation simple."
 *
 * Does not attempt to create a fixture while `isCreationHalted()` is true
 * (see that function's documentation) -- this is checked separately from
 * the normal per-tick try/catch in `runEngine` because a halted state
 * needs to persist across ticks, not just be logged and retried like an
 * ordinary transient failure.
 */
export async function tick(deps: EngineDeps, options: EngineOptions, nowSeconds: number): Promise<void> {
  await settleDueFixtures(deps, nowSeconds);
  if (listPendingFixtureIds().length === 0 && !isCreationHalted()) {
    try {
      const fixture = await createFixture(deps, options.closingInSeconds);
      console.log(
        `[blackbox-backend] created fixture ${fixture.fixtureId} (markets ${fixture.contractMarketIds.winner}, ` +
          `${fixture.contractMarketIds.overUnder}; commitment ${fixture.commitment}; closes ${new Date(
            fixture.closingTime * 1000,
          ).toISOString()})`,
      );
    } catch (error) {
      if (error instanceof PartialFixtureCreationError) {
        creationHaltedReason = error.message;
        console.error(`[blackbox-backend] FIXTURE CREATION HALTED: ${error.message}`);
        return;
      }
      throw error;
    }
  }
}

/** Runs the engine forever, ticking on the configured poll interval. */
export async function runEngine(
  deps: EngineDeps,
  options: EngineOptions & { pollIntervalMs: number },
): Promise<void> {
  while (true) {
    try {
      await tick(deps, options, Math.floor(Date.now() / 1000));
    } catch (error) {
      console.error("[blackbox-backend] engine tick failed", error);
    }
    await new Promise((resolve) => setTimeout(resolve, options.pollIntervalMs));
  }
}
