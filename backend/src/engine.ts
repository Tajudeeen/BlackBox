import type { FixtureDeps as RunFixtureDeps } from "./fixtures/runFixture.js";
import { createFixture, PartialFixtureCreationError } from "./fixtures/runFixture.js";
import { listPendingFixtureIds, getPendingFixture } from "./fixtures/pendingStore.js";
import { settleFixture, type FixtureDeps as SettleFixtureDeps } from "./fixtures/settleFixture.js";
import { GENERATORS, getGenerator } from "./generators/registry.js";

export type EngineDeps = RunFixtureDeps & SettleFixtureDeps;

export type EngineOptions = {
  closingInSeconds: number;
  haltRecoveryMs?: number;
};

// Per-generator halt state. A partial creation failure on one generator
// halts only that generator, not the others. Auto-recovers after
// haltRecoveryMs (configurable, see config.ts's HALT_RECOVERY_MS -- this
// default only applies if the caller doesn't pass one, e.g. in tests).
const DEFAULT_HALT_RECOVER_MS = 2 * 60 * 1000;
const generatorHaltedAt = new Map<string, number>();

export function isGeneratorHalted(generatorName: string, haltRecoveryMs = DEFAULT_HALT_RECOVER_MS): boolean {
  const haltedAt = generatorHaltedAt.get(generatorName);
  if (haltedAt === undefined) return false;
  if (Date.now() - haltedAt >= haltRecoveryMs) {
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

/**
 * Returns, per generator, whether it currently has an OPEN fixture --
 * one whose closing time has not passed yet, i.e. still accepting
 * predictions. This is deliberately narrower than "has any pending
 * fixture at all": a fixture that has closed but not yet settled no
 * longer counts as open, so a new fixture for that generator can start
 * accepting predictions immediately instead of waiting for the old one's
 * on-chain settlement transaction to land. Settlement (see
 * settleDueFixtures) processes every pending fixture independently of
 * this, regardless of generator or how many fixtures that generator has
 * in flight.
 */
function openGeneratorNames(nowSeconds: number): Set<string> {
  const names = new Set<string>();
  for (const fixtureId of listPendingFixtureIds()) {
    const pending = getPendingFixture(fixtureId);
    if (pending && nowSeconds < pending.closingTime) {
      names.add(pending.generatorName);
    }
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
 * every generator independently: if a generator has no OPEN fixture right
 * now (see openGeneratorNames) and is not halted, it creates a new one --
 * even if an older fixture from that same generator is still waiting to
 * settle. This means there is continuously an open market for every
 * sport; a market never sits closed-with-nothing-to-predict-on while its
 * predecessor's settlement transaction is in flight.
 */
export async function tick(deps: EngineDeps, options: EngineOptions, nowSeconds: number): Promise<void> {
  await settleDueFixtures(deps, nowSeconds);

  const open = openGeneratorNames(nowSeconds);
  const haltRecoveryMs = options.haltRecoveryMs ?? DEFAULT_HALT_RECOVER_MS;

  for (const generator of GENERATORS) {
    const hasOpenFixture = open.has(generator.name);
    const halted = isGeneratorHalted(generator.name, haltRecoveryMs);

    if (!hasOpenFixture && !halted) {
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
            `[blackbox-backend] ${generator.name} HALTED (auto-recovers in ${Math.round(haltRecoveryMs / 1000)}s): ${error.message}`,
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
