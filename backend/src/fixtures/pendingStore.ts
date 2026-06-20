/**
 * Holds the secret seed for each fixture between commitment and reveal.
 *
 * This is intentionally in-memory and process-local: the seed must stay
 * private until reveal, so it cannot go in the public `simulation_events`
 * table (see schema.sql). A restart of the engine before a pending fixture
 * settles will lose that fixture's seed, leaving its markets uresolvable
 * until an operator intervenes manually. For a hackathon-scale deployment
 * this is an acceptable, documented limitation; a production deployment
 * would replace this with a durable private store (an encrypted row in a
 * private table, or a secrets manager) keyed the same way.
 */
export type PendingFixture = {
  seedHex: string;
  marketRowIds: { winner: string; overUnder: string };
  contractMarketIds: { winner: bigint; overUnder: bigint };
  closingTime: number;
};

const pendingFixtures = new Map<string, PendingFixture>();

export function rememberPendingFixture(fixtureId: string, fixture: PendingFixture): void {
  pendingFixtures.set(fixtureId, fixture);
}

export function getPendingFixture(fixtureId: string): PendingFixture | undefined {
  return pendingFixtures.get(fixtureId);
}

export function forgetPendingFixture(fixtureId: string): void {
  pendingFixtures.delete(fixtureId);
}

export function listPendingFixtureIds(): string[] {
  return [...pendingFixtures.keys()];
}
