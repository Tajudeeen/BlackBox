import type { FixtureDeps as RunFixtureDeps } from "./fixtures/runFixture.js";
import { createFixture, PartialFixtureCreationError } from "./fixtures/runFixture.js";
import { listPendingFixtureIds, getPendingFixture } from "./fixtures/pendingStore.js";
import { settleFixture, type FixtureDeps as SettleFixtureDeps } from "./fixtures/settleFixture.js";
import { pickGenerator } from "./generators/registry.js";

export type EngineDeps = RunFixtureDeps & SettleFixtureDeps;

export type EngineOptions = {
  closingInSeconds: number;
};

// How long to stay halted before auto-recovering and retrying. 10 minutes.
// This means a transient Sepolia RPC blip that orphaned a market auto-
// recovers without needing a manual restart. The orphaned market is logged
// clearly and stays open on-chain but unresolvable by this engine.
const HALT_AUTO_RECOVER_MS = 10 * 60 * 1000;

let creationHaltedAt: number | null = null;

// Tracks how many fixtures this engine instance has created. Used for the
// round-robin generator selection. Resets to 0 on restart, which is fine --
// the rotation picks up from a potentially different spot each deployment,
// and that variation is harmless.
let fixtureCount = 0;

export function isCreationHalted(): boolean {
  if (creationHaltedAt === null) return false;
  // Auto-recover after HALT_AUTO_RECOVER_MS.
  if (Date.now() - creationHaltedAt >= HALT_AUTO_RECOVER_MS) {
    console.log("[blackbox-backend] halt auto-recovered after timeout -- retrying fixture creation");
    creationHaltedAt = null;
    return false;
  }
  return true;
}

export function resetCreationHalt(): void {
  creationHaltedAt = null;
}

export async function settleDueFixtures(deps: EngineDeps, nowSeconds: number): Promise<string[]> {
  const settled: string[] = [];
  for (const fixtureId of listPendingFixtureIds()) {
    const pending = getPendingFixture(fixtureId);
    if (pending && nowSeconds >= pending.closingTime) {
      const result = await settleFixture(deps, fixtureId);
      console.log(`[blackbox-backend] settled fixture ${fixtureId} (${result.generatorName}): ${result.summary}`);
      settled.push(fixtureId);
    }
  }
  return settled;
}

export async function tick(deps: EngineDeps, options: EngineOptions, nowSeconds: number): Promise<void> {
  await settleDueFixtures(deps, nowSeconds);

  if (listPendingFixtureIds().length === 0 && !isCreationHalted()) {
    const generator = pickGenerator(fixtureCount);
    try {
      const fixture = await createFixture(deps, generator, options.closingInSeconds);
      fixtureCount += 1;
      console.log(
        `[blackbox-backend] created ${fixture.generatorName} fixture ${fixture.fixtureId} ` +
          `(markets ${fixture.contractMarketIds.join(", ")}; ` +
          `commitment ${fixture.commitment}; ` +
          `closes ${new Date(fixture.closingTime * 1000).toISOString()})`,
      );
    } catch (error) {
      if (error instanceof PartialFixtureCreationError) {
        creationHaltedAt = Date.now();
        console.error(
          `[blackbox-backend] FIXTURE CREATION HALTED (auto-recovers in ${HALT_AUTO_RECOVER_MS / 60_000}min): ${error.message}`,
        );
        return;
      }
      throw error;
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
