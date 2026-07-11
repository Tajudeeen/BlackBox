import { randomUUID } from "node:crypto";

import type { ChainClient } from "../chain/client.js";
import type { DbClient } from "../db/types.js";
import { insertMarket } from "../db/markets.js";
import { insertSimulationEvent } from "../db/simulationEvents.js";
import type { Generator } from "../generators/types.js";
import { commitSeed, generateSeed } from "../generators/virtualFootball/randomness.js";
import { rememberPendingFixture } from "./pendingStore.js";

export type FixtureDeps = {
  chain: ChainClient;
  db: DbClient;
};

export type CreatedFixture = {
  fixtureId: string;
  generatorName: string;
  commitment: string;
  closingTime: number;
  contractMarketIds: bigint[];
};

/**
 * Thrown when fixture creation fails after at least one on-chain market
 * was already created. The engine catches this, logs the orphaned market
 * ids, and halts automatic creation to avoid making it worse.
 */
export class PartialFixtureCreationError extends Error {
  constructor(
    public readonly orphanedMarketIds: bigint[],
    cause: unknown,
  ) {
    super(
      `Fixture creation failed after market id(s) ${orphanedMarketIds.join(", ")} were already ` +
        `created on chain. Automatic fixture creation is now halted. Restart the engine to recover.`,
      { cause },
    );
  }
}

/**
 * Creates one fixture using the given generator: commits to a secret seed,
 * creates all markets on chain, and records metadata in Postgres.
 */
export async function createFixture(
  deps: FixtureDeps,
  generator: Generator,
  closingInSeconds: number,
): Promise<CreatedFixture> {
  const fixtureId = randomUUID();
  const seedHex = generateSeed();
  const commitment = commitSeed(seedHex);
  const closingTime = Math.floor(Date.now() / 1000) + closingInSeconds;
  const closingDate = new Date(closingTime * 1000);
  const generatorMarkets = generator.getMarkets();

  const createdOnChain: { marketId: bigint; txHash: string }[] = [];

  // Create markets on chain one by one. If any fails, throw with the
  // ids already created so the engine can halt and log them.
  for (const market of generatorMarkets) {
    try {
      const result = await deps.chain.createMarket(
        market.eventType,
        market.label,
        closingTime,
        market.oddsBps,
      );
      createdOnChain.push(result);
    } catch (error) {
      throw new PartialFixtureCreationError(
        createdOnChain.map((m) => m.marketId),
        error,
      );
    }
  }

  // Write metadata to Postgres. If this fails, all markets exist on chain
  // but nothing recorded them -- throw with all ids so the engine halts.
  try {
    const pendingMarkets: { marketRowId: string; contractMarketId: bigint }[] = [];

    for (let i = 0; i < generatorMarkets.length; i++) {
      const market = generatorMarkets[i];
      const onChain = createdOnChain[i];

      const marketRowId = await insertMarket(deps.db, {
        contractMarketId: onChain.marketId,
        eventType: market.eventType,
        label: market.label,
        closingTime: closingDate,
      });

      await insertSimulationEvent(deps.db, {
        marketRowId,
        fixtureId,
        generator: generator.name,
        seedCommitment: commitment,
      });

      pendingMarkets.push({ marketRowId, contractMarketId: onChain.marketId });
    }

    await rememberPendingFixture(
      fixtureId,
      {
        generatorName: generator.name,
        seedHex,
        markets: pendingMarkets,
        closingTime,
      },
      deps.db,
    );
  } catch (error) {
    throw new PartialFixtureCreationError(
      createdOnChain.map((m) => m.marketId),
      error,
    );
  }

  return {
    fixtureId,
    generatorName: generator.name,
    commitment,
    closingTime,
    contractMarketIds: createdOnChain.map((m) => m.marketId),
  };
}
