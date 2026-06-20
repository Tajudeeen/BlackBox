import type { DbClient } from "./types.js";

export type InsertSimulationEventParams = {
  marketRowId: string;
  fixtureId: string;
  generator: string;
  seedCommitment: string;
};

/** Records the public randomness commitment for a market, before it closes. */
export async function insertSimulationEvent(pool: DbClient, params: InsertSimulationEventParams): Promise<void> {
  await pool.query(
    `INSERT INTO simulation_events (market_id, fixture_id, generator, seed_commitment)
     VALUES ($1, $2, $3, $4)`,
    [params.marketRowId, params.fixtureId, params.generator, params.seedCommitment],
  );
}

export type RevealSimulationEventParams = {
  fixtureId: string;
  seedReveal: string;
  outcomeSummary: string;
};

/** Publishes the seed reveal and outcome summary for every market in a fixture. */
export async function revealSimulationEvent(pool: DbClient, params: RevealSimulationEventParams): Promise<void> {
  await pool.query(
    `UPDATE simulation_events
     SET seed_reveal = $2, outcome_summary = $3
     WHERE fixture_id = $1`,
    [params.fixtureId, params.seedReveal, params.outcomeSummary],
  );
}
