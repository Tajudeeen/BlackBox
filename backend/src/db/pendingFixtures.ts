import type { DbClient } from "./types.js";
import type { PendingFixture, PendingMarket } from "../fixtures/pendingStore.js";

type PendingFixtureRow = {
  fixture_id: string;
  generator_name: string;
  seed_hex: string;
  markets: { marketRowId: string; contractMarketId: string }[];
  closing_time: string;
};

function rowToPendingFixture(row: PendingFixtureRow): PendingFixture {
  return {
    generatorName: row.generator_name,
    seedHex: row.seed_hex,
    markets: row.markets.map((m): PendingMarket => ({
      marketRowId: m.marketRowId,
      contractMarketId: BigInt(m.contractMarketId),
    })),
    closingTime: Number(row.closing_time),
  };
}

/**
 * Persists a pending fixture's secret seed and market list so it survives
 * a process restart. Call this at the same time as (or immediately after)
 * the in-memory `rememberPendingFixture` -- see pendingStore.ts.
 */
export async function insertPendingFixture(
  db: DbClient,
  fixtureId: string,
  fixture: PendingFixture,
): Promise<void> {
  const marketsJson = JSON.stringify(
    fixture.markets.map((m) => ({
      marketRowId: m.marketRowId,
      contractMarketId: m.contractMarketId.toString(),
    })),
  );

  await db.query(
    `INSERT INTO pending_fixtures (fixture_id, generator_name, seed_hex, markets, closing_time)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (fixture_id) DO NOTHING`,
    [fixtureId, fixture.generatorName, fixture.seedHex, marketsJson, fixture.closingTime],
  );
}

/** Deletes a pending fixture's persisted row once it has settled. */
export async function deletePendingFixture(db: DbClient, fixtureId: string): Promise<void> {
  await db.query(`DELETE FROM pending_fixtures WHERE fixture_id = $1`, [fixtureId]);
}

/**
 * Loads every persisted pending fixture, keyed by fixture id. Call this
 * once at startup (see index.ts) to repopulate the in-memory pending
 * store before the engine loop begins -- this is what makes a fixture
 * survive a Railway redeploy instead of being silently orphaned.
 */
export async function loadAllPendingFixtures(db: DbClient): Promise<Map<string, PendingFixture>> {
  const result = await db.query<PendingFixtureRow>(
    `SELECT fixture_id, generator_name, seed_hex, markets, closing_time FROM pending_fixtures`,
  );

  const map = new Map<string, PendingFixture>();
  for (const row of result.rows) {
    map.set(row.fixture_id, rowToPendingFixture(row));
  }
  return map;
}
