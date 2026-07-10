import type { FixtureDeps as RunFixtureDeps } from "./fixtures/runFixture.js";
import { createFixture, PartialFixtureCreationError } from "./fixtures/runFixture.js";
import { listPendingFixtureIds, getPendingFixture } from "./fixtures/pendingStore.js";
import { settleFixture, type FixtureDeps as SettleFixtureDeps } from "./fixtures/settleFixture.js";
import { GENERATORS, getGenerator } from "./generators/registry.js";

export type EngineDeps = RunFixtureDeps & SettleFixtureDeps;

export type EngineOptions = {
  closingInSeconds: number;
};

// Per-generator halt state. A partial creation failure on one generator
// halts only that generator, not the others. Auto-recovers after 10 minutes.
const HALT_AUTO_RECOVER_MS = 10 * 60 * 1000;
const generatorHaltedAt = new Map<string, number>();

export function isGeneratorHalted(generatorName: string): boolean {
  const haltedAt = generatorHaltedAt.get(generatorName);
  if (haltedAt === undefined) return false;
  if (Date.now() - haltedAt >= HALT_AUTO_RECOVER_MS) {
    console.log(`[blackbox-backend] ${generatorName} halt auto-recovered -- retrying`);
    generatorHaltedAt.delete(generatorName);
    return false;
  }
  return true;
}

export function resetGeneratorHalt(generatorName: string): void {
  generatorHaltedAt.delete(generatorName);
}

export function resetAllHalts(): void {
  generatorHaltedAt.clear();
}

/** Returns the generator name for a pending fixture, or null if not found. */
function pendingGeneratorNames(): Set<string> {
  const names = new Set<string>();
  for (const fixtureId of listPendingFixtureIds()) {
    const pending = getPendingFixture(fixtureId);
    if (pending) names.add(pending.generatorName);
  }
  return names;
}

export async function settleDueFixtures(deps: EngineDeps, nowSeconds: number): Promise<string[]> {
  const due = listPendingFixtureIds().filter((fixtureId) => {
    const pending = getPendingFixture(fixtureId);
    return pending && nowSeconds >= pending.closingTime;
  });

  if (due.length === 0) return [];

  // Settle all due fixtures concurrently — independent Sepolia transactions
  // don't need to wait for each other
  const results = await Promise.allSettled(
    due.map(async (fixtureId) => {
      const result = await settleFixture(deps, fixtureId);
      console.log(
        `[blackbox-backend] settled ${result.generatorName} fixture ${fixtureId}: ${result.summary}`,
      );
      return fixtureId;
    }),
  );

  const settled: string[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      settled.push(r.value);
    } else {
      console.error("[blackbox-backend] fixture settlement failed", r.reason);
    }
  }
  return settled;
}

/**
 * One engine tick. Settles any fixtures due for settlement, then checks
 * every generator independently: if a generator has no pending fixture and
 * is not halted, it creates one. All three generators run in parallel --
 * football, dog race, and horse race each have their own open market at
 * the same time.
 */
export async function tick(deps: EngineDeps, options: EngineOptions, nowSeconds: number): Promise<void> {
  await settleDueFixtures(deps, nowSeconds);

  const activeGenerators = pendingGeneratorNames();

  for (const generator of GENERATORS) {
    const alreadyRunning = activeGenerators.has(generator.name);
    const halted = isGeneratorHalted(generator.name);

    if (!alreadyRunning && !halted) {
      try {
        const fixture = await createFixture(deps, generator, options.closingInSeconds);
        console.log(
          `[blackbox-backend] created ${fixture.generatorName} fixture ${fixture.fixtureId} ` +
            `(markets ${fixture.contractMarketIds.join(", ")}; ` +
            `commitment ${fixture.commitment}; ` +
            `closes ${new Date(fixture.closingTime * 1000).toISOString()})`,
        );
      } catch (error) {
        if (error instanceof PartialFixtureCreationError) {
          generatorHaltedAt.set(generator.name, Date.now());
          console.error(
            `[blackbox-backend] ${generator.name} HALTED (auto-recovers in ${HALT_AUTO_RECOVER_MS / 60_000}min): ${error.message}`,
          );
        } else {
          throw error;
        }
      }
    }
  }
}

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

// Keep getGenerator in scope for the registry import used in tests
export { getGenerator };
