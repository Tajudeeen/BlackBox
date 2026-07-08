/**
 * Holds the secret seed for each fixture between commitment and reveal.
 *
 * In-memory and process-local by design: the seed must stay private until
 * reveal. A Railway restart loses pending seeds. That is a known, documented
 * limitation. Markets whose seeds are lost cannot be auto-resolved -- they
 * stay open on-chain until the closing time passes, at which point the
 * frontend shows them as "Closed" and no one can submit new predictions.
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
