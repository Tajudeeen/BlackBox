import type { DbClient } from "../db/types.js";
import { deletePendingFixture, insertPendingFixture } from "../db/pendingFixtures.js";

/**
 * Holds the secret seed for each fixture between commitment and reveal.
 *
 * Backed by both an in-memory Map (for fast synchronous reads during a
 * tick) and the `pending_fixtures` table (so a process restart -- a
 * Railway redeploy, a crash, a host restart -- doesn't silently orphan
 * whatever fixtures were open at that moment). See db/pendingFixtures.ts
 * and index.ts's startup sequence, which calls loadAllPendingFixtures()
 * to repopulate this in-memory map before the engine loop begins.
 *
 * Before this persistence existed, a lost seed meant a market could never
 * resolve -- it just sat open on-chain forever. If you deployed this
 * backend without ever running the updated schema.sql (the
 * `pending_fixtures` table), fixtures created after that point will still
 * only live in memory and will still be lost on restart. Run the schema
 * migration first.
 */
export type PendingMarket = {
  marketRowId: string;
  contractMarketId: bigint;
};

export type PendingFixture = {
  generatorName: string;
  seedHex: string;
  markets: PendingMarket[];
  closingTime: number;
};

const pendingFixtures = new Map<string, PendingFixture>();

/**
 * Remembers a pending fixture in memory and, if a db client is provided,
 * persists it so it survives a restart. Always pass `db` in production
 * code paths (see runFixture.ts) -- the no-db overload exists only so
 * tests can exercise the in-memory behavior without a real database.
 */
export async function rememberPendingFixture(
  fixtureId: string,
  fixture: PendingFixture,
  db?: DbClient,
): Promise<void> {
  pendingFixtures.set(fixtureId, fixture);
  if (db) {
    await insertPendingFixture(db, fixtureId, fixture);
  }
}

export function getPendingFixture(fixtureId: string): PendingFixture | undefined {
  return pendingFixtures.get(fixtureId);
}

/**
 * Forgets a pending fixture from memory and, if a db client is provided,
 * deletes its persisted row. Always pass `db` in production code paths
 * (see settleFixture.ts).
 */
export async function forgetPendingFixture(fixtureId: string, db?: DbClient): Promise<void> {
  pendingFixtures.delete(fixtureId);
  if (db) {
    await deletePendingFixture(db, fixtureId);
  }
}

export function listPendingFixtureIds(): string[] {
  return [...pendingFixtures.keys()];
}

/** Replaces the entire in-memory map. Used once at startup to load persisted fixtures. */
export function loadPendingFixturesIntoMemory(fixtures: Map<string, PendingFixture>): void {
  pendingFixtures.clear();
  for (const [fixtureId, fixture] of fixtures) {
    pendingFixtures.set(fixtureId, fixture);
  }
}

/** Clears the in-memory map. Exposed for tests to reset state between runs. */
export function clearAllPendingFixtures(): void {
  pendingFixtures.clear();
}
