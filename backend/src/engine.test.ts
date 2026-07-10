import assert from "node:assert/strict";
import { test } from "node:test";

import type { ChainClient, MarketInfo } from "./chain/client.js";
import type { DbClient } from "./db/types.js";
import {
  isGeneratorHalted,
  resetAllHalts,
  settleDueFixtures,
  tick,
} from "./engine.js";
import {
  forgetPendingFixture,
  getPendingFixture,
  listPendingFixtureIds,
  rememberPendingFixture,
} from "./fixtures/pendingStore.js";
import { generateSeed } from "./generators/virtualFootball/randomness.js";

function baseMarketInfo(overrides: Partial<MarketInfo> = {}): MarketInfo {
  return {
    exists: true,
    resolved: false,
    outcomeCount: 3,
    winningOutcome: 0,
    closingTime: 0,
    eventType: "virtual_football_winner",
    label: "",
    ...overrides,
  };
}

function createFakeChain() {
  let nextId = 0n;
  const created: { eventType: string; label: string }[] = [];
  const resolved: { marketId: bigint; winningOutcome: number }[] = [];

  const chain: ChainClient = {
    async createMarket(eventType, label) {
      const marketId = nextId++;
      created.push({ eventType, label });
      return { marketId, txHash: `0xfaketx${marketId}` };
    },
    async resolveMarket(marketId, winningOutcome) {
      resolved.push({ marketId, winningOutcome });
      return `0xfakeresolve${marketId}`;
    },
    async getMarket(): Promise<MarketInfo> {
      return baseMarketInfo();
    },
  };

  return { chain, created, resolved };
}

function createFakeDb() {
  let rowCounter = 0;
  const db: DbClient = {
    async query() {
      rowCounter += 1;
      return { rows: [{ id: `fake-row-${rowCounter}` }] } as never;
    },
  };
  return { db };
}

test("settleDueFixtures settles only fixtures whose closing time has passed", async () => {
  resetAllHalts();
  const { chain, resolved } = createFakeChain();
  const { db } = createFakeDb();

  rememberPendingFixture("fixture-due", {
    generatorName: "virtual_football",
    seedHex: generateSeed(),
    markets: [
      { marketRowId: "row-1", contractMarketId: 100n },
      { marketRowId: "row-2", contractMarketId: 101n },
    ],
    closingTime: 1_000,
  });
  rememberPendingFixture("fixture-not-due", {
    generatorName: "dog_race",
    seedHex: generateSeed(),
    markets: [{ marketRowId: "row-3", contractMarketId: 102n }],
    closingTime: 5_000,
  });

  try {
    const settled = await settleDueFixtures({ chain, db }, 2_000);
    assert.deepStrictEqual(settled, ["fixture-due"]);
    assert.strictEqual(getPendingFixture("fixture-due"), undefined);
    assert.ok(getPendingFixture("fixture-not-due"));
    assert.strictEqual(resolved.length, 2);
  } finally {
    forgetPendingFixture("fixture-due");
    forgetPendingFixture("fixture-not-due");
    resetAllHalts();
  }
});

test("tick creates one fixture per generator when none are pending", async () => {
  resetAllHalts();
  // Clear any pending fixtures from prior tests
  for (const id of listPendingFixtureIds()) forgetPendingFixture(id);

  const { chain, created } = createFakeChain();
  const { db } = createFakeDb();

  try {
    await tick({ chain, db }, { closingInSeconds: 1_800 }, Math.floor(Date.now() / 1000));

    const ids = listPendingFixtureIds();
    // Three generators: virtual_football (2 markets), dog_race (1), horse_race (2) = 5 total
    assert.strictEqual(ids.length, 3);
    assert.strictEqual(created.length, 5);

    const generatorNames = ids.map((id) => getPendingFixture(id)?.generatorName).sort();
    assert.deepStrictEqual(generatorNames, ["dog_race", "horse_race", "virtual_football"]);
  } finally {
    for (const id of listPendingFixtureIds()) forgetPendingFixture(id);
    resetAllHalts();
  }
});

test("tick does not create a duplicate fixture for a generator already pending", async () => {
  resetAllHalts();
  for (const id of listPendingFixtureIds()) forgetPendingFixture(id);

  const { chain, created } = createFakeChain();
  const { db } = createFakeDb();

  const farFuture = Math.floor(Date.now() / 1000) + 10_000;
  rememberPendingFixture("already-pending", {
    generatorName: "virtual_football",
    seedHex: generateSeed(),
    markets: [
      { marketRowId: "row-w", contractMarketId: 9n },
      { marketRowId: "row-o", contractMarketId: 10n },
    ],
    closingTime: farFuture,
  });

  try {
    await tick({ chain, db }, { closingInSeconds: 1_800 }, Math.floor(Date.now() / 1000));

    // football already has a fixture, so only dog_race and horse_race should be created
    const ids = listPendingFixtureIds();
    const generatorNames = ids.map((id) => getPendingFixture(id)?.generatorName).sort();
    assert.ok(!generatorNames.includes("virtual_football") || generatorNames.filter(n => n === "virtual_football").length === 1);
    // dog_race (1 market) + horse_race (2 markets) = 3 new market calls
    assert.strictEqual(created.length, 3);
  } finally {
    for (const id of listPendingFixtureIds()) forgetPendingFixture(id);
    resetAllHalts();
  }
});

test("a partial creation failure halts only that generator, not the others", async () => {
  resetAllHalts();
  for (const id of listPendingFixtureIds()) forgetPendingFixture(id);

  let footballCallCount = 0;
  const chain: ChainClient = {
    async createMarket(eventType) {
      // Fail on the second virtual_football market (over/under)
      if (eventType === "virtual_football_over_under") {
        throw new Error("simulated failure on football over/under");
      }
      footballCallCount++;
      return { marketId: BigInt(footballCallCount), txHash: "0xok" };
    },
    async resolveMarket() { return "0x"; },
    async getMarket(): Promise<MarketInfo> { return baseMarketInfo(); },
  };
  const { db } = createFakeDb();

  try {
    await tick({ chain, db }, { closingInSeconds: 1_800 }, Math.floor(Date.now() / 1000));

    // Football is halted
    assert.strictEqual(isGeneratorHalted("virtual_football"), true);
    // Dog race and horse race are not halted
    assert.strictEqual(isGeneratorHalted("dog_race"), false);
    assert.strictEqual(isGeneratorHalted("horse_race"), false);

    // Dog race and horse race fixtures should still have been created
    const names = listPendingFixtureIds()
      .map((id) => getPendingFixture(id)?.generatorName)
      .filter(Boolean)
      .sort();
    assert.ok(names.includes("dog_race"));
    assert.ok(names.includes("horse_race"));
  } finally {
    for (const id of listPendingFixtureIds()) forgetPendingFixture(id);
    resetAllHalts();
  }
});
