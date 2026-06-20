import { randomUUID } from "node:crypto";

import type { ChainClient } from "../chain/client.js";
import type { DbClient } from "../db/types.js";
import { insertMarket } from "../db/markets.js";
import { insertSimulationEvent } from "../db/simulationEvents.js";
import {
  OVER_UNDER_EVENT_TYPE,
  OVER_UNDER_LABEL,
  OVER_UNDER_ODDS_BPS,
  WINNER_EVENT_TYPE,
  WINNER_LABEL,
  WINNER_ODDS_BPS,
} from "../generators/virtualFootball/market.js";
import { commitSeed, generateSeed } from "../generators/virtualFootball/randomness.js";
import { rememberPendingFixture } from "./pendingStore.js";

export type FixtureDeps = {
  chain: ChainClient;
  db: DbClient;
};

export type CreatedFixture = {
  fixtureId: string;
  commitment: string;
  closingTime: number;
  contractMarketIds: { winner: bigint; overUnder: bigint };
};

/**
 * Thrown when fixture creation fails after at least one on-chain market
 * was already created. Found during the Phase 5 review: the original
 * version of this function only called `rememberPendingFixture` at the
 * very end, after both markets were created and both database rows were
 * written. If anything failed partway -- say the winner market's
 * `createMarket` call succeeded but the over/under market's failed --
 * nothing about the winner market was recorded anywhere. The engine would
 * have no way to know that market existed, so it could never resolve it,
 * and worse, the next tick would see no pending fixture and try to create
 * a brand new one from scratch, repeating the failure and orphaning
 * another market every time it recurred.
 *
 * This type exists so callers (see engine.ts) can distinguish "nothing
 * was created, safe to retry from scratch" from "something was already
 * created on chain, retrying blindly would orphan more of it" and react
 * accordingly -- specifically, by halting automatic fixture creation
 * until an operator has manually accounted for the orphaned market(s).
 */
export class PartialFixtureCreationError extends Error {
  constructor(
    public readonly orphanedMarketIds: bigint[],
    cause: unknown,
  ) {
    super(
      `Fixture creation failed after market id(s) ${orphanedMarketIds.join(", ")} were already created on ` +
        `chain. This engine has no record of them and will never resolve them on its own. Automatic ` +
        `fixture creation is now halted to avoid orphaning further markets on repeated failures -- ` +
        `resolve or otherwise account for the listed market id(s) manually, then restart the engine.`,
      { cause },
    );
  }
}

/**
 * Creates one virtual football fixture: commits to a secret seed, creates
 * the Winner and Over/Under markets on chain with a shared closing time,
 * and records the public market metadata and randomness commitment in
 * Postgres. The secret seed itself is kept only in the process-local
 * pending fixture store until `settleFixture` reveals it.
 *
 * If this throws `PartialFixtureCreationError`, see that type's
 * documentation -- at least one market now exists on chain that this
 * engine instance has no record of.
 */
export async function createFixture(deps: FixtureDeps, closingInSeconds: number): Promise<CreatedFixture> {
  const fixtureId = randomUUID();
  const seedHex = generateSeed();
  const commitment = commitSeed(seedHex);
  const closingTime = Math.floor(Date.now() / 1000) + closingInSeconds;

  const winner = await deps.chain.createMarket(WINNER_EVENT_TYPE, WINNER_LABEL, closingTime, WINNER_ODDS_BPS);

  let overUnder: { marketId: bigint; txHash: string };
  try {
    overUnder = await deps.chain.createMarket(
      OVER_UNDER_EVENT_TYPE,
      OVER_UNDER_LABEL,
      closingTime,
      OVER_UNDER_ODDS_BPS,
    );
  } catch (error) {
    throw new PartialFixtureCreationError([winner.marketId], error);
  }

  try {
    const closingDate = new Date(closingTime * 1000);
    const winnerRowId = await insertMarket(deps.db, {
      contractMarketId: winner.marketId,
      eventType: WINNER_EVENT_TYPE,
      label: WINNER_LABEL,
      closingTime: closingDate,
    });
    const overUnderRowId = await insertMarket(deps.db, {
      contractMarketId: overUnder.marketId,
      eventType: OVER_UNDER_EVENT_TYPE,
      label: OVER_UNDER_LABEL,
      closingTime: closingDate,
    });

    await insertSimulationEvent(deps.db, {
      marketRowId: winnerRowId,
      fixtureId,
      generator: "virtual_football",
      seedCommitment: commitment,
    });
    await insertSimulationEvent(deps.db, {
      marketRowId: overUnderRowId,
      fixtureId,
      generator: "virtual_football",
      seedCommitment: commitment,
    });

    rememberPendingFixture(fixtureId, {
      seedHex,
      marketRowIds: { winner: winnerRowId, overUnder: overUnderRowId },
      contractMarketIds: { winner: winner.marketId, overUnder: overUnder.marketId },
      closingTime,
    });
  } catch (error) {
    throw new PartialFixtureCreationError([winner.marketId, overUnder.marketId], error);
  }

  return {
    fixtureId,
    commitment,
    closingTime,
    contractMarketIds: { winner: winner.marketId, overUnder: overUnder.marketId },
  };
}
