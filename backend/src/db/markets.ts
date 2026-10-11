import type { DbClient } from "./types.js";

export type InsertMarketParams = {
  contractMarketId: bigint;
  eventType: string;
  label: string;
  closingTime: Date;
};

/** Inserts the public metadata row for an on-chain market. Returns the database row id. */
export async function insertMarket(pool: DbClient, params: InsertMarketParams): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO v2_markets (contract_market_id, event_type, label, closes_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (contract_market_id) DO UPDATE SET label = EXCLUDED.label
     RETURNING id`,
    [params.contractMarketId.toString(), params.eventType, params.label, params.closingTime],
  );
  return result.rows[0].id;
}

/** Marks a market row as settled, stamping the current time. */
export async function markMarketSettled(pool: DbClient, marketRowId: string): Promise<void> {
  await pool.query(`UPDATE v2_markets SET settled_at = now() WHERE id = $1`, [marketRowId]);
}
