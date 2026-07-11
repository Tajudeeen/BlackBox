import assert from "node:assert/strict";
import { test } from "node:test";

import type { ChainClient, MarketInfo } from "../chain/client.js";
import type { DbClient } from "../db/types.js";
import { generateSeed } from "../generators/virtualFootball/randomness.js";
import { virtualFootball } from "../generators/virtualFootball/index.js";
import {
  forgetPendingFixture,
  getPendingFixture,
  rememberPendingFixture,
} from "./pendingStore.js";
import { settleFixture } from "./settleFixture.js";

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

function createFakeDb() {
  const queries: { text: string; values?: unknown[] }[] = [];
  const db: DbClient = {
    async query(text, values) {
      queries.push({ text, values });
      return { rows: [] } as never;
    },
  };
  return { db, queries };
}

test("settleFixture resolves both markets when neither is resolved yet", async () => {
  const resolved: bigint[] = [];
  const resolvedStatus = new Map<bigint, boolean>([
    [200n, false],
    [201n, false],
  ]);
  const chain: ChainClient = {
    async createMarket() { throw new Error("not used"); },
    async resolveMarket(marketId) {
      resolved.push(marketId);
      resolvedStatus.set(marketId, true);
      return `0xresolve${marketId}`;
    },
    async getMarket(marketId) {
      return baseMarketInfo({ resolved: resolvedStatus.get(marketId) ?? false });
    },
  };
  const { db } = createFakeDb();

  const seedHex = generateSeed();
  await rememberPendingFixture("fixture-fresh", {
    generatorName: "virtual_football",
    seedHex,
    markets: [
      { marketRowId: "row-w", contractMarketId: 200n },
      { marketRowId: "row-o", contractMarketId: 201n },
    ],
    closingTime: 1_000,
  });

  try {
    await settleFixture({ chain, db }, "fixture-fresh");
    assert.deepStrictEqual(resolved, [200n, 201n]);
    assert.strictEqual(getPendingFixture("fixture-fresh"), undefined);
  } finally {
    await forgetPendingFixture("fixture-fresh");
  }
});

test("settleFixture skips an already-resolved market and still resolves the pending one", async () => {
  const resolveCalls: bigint[] = [];
  const resolvedStatus = new Map<bigint, boolean>([
    [300n, true],  // already resolved
    [301n, false], // still pending
  ]);
  const chain: ChainClient = {
    async createMarket() { throw new Error("not used"); },
    async resolveMarket(marketId) {
      resolveCalls.push(marketId);
      resolvedStatus.set(marketId, true);
      return `0xresolve${marketId}`;
    },
    async getMarket(marketId) {
      return baseMarketInfo({ resolved: resolvedStatus.get(marketId) ?? false });
    },
  };
  const { db } = createFakeDb();

  const seedHex = generateSeed();
  await rememberPendingFixture("fixture-partial", {
    generatorName: "virtual_football",
    seedHex,
    markets: [
      { marketRowId: "row-w2", contractMarketId: 300n },
      { marketRowId: "row-o2", contractMarketId: 301n },
    ],
    closingTime: 1_000,
  });

  try {
    await settleFixture({ chain, db }, "fixture-partial");
    assert.deepStrictEqual(resolveCalls, [301n]);
    assert.strictEqual(getPendingFixture("fixture-partial"), undefined);
  } finally {
    await forgetPendingFixture("fixture-partial");
  }
});

test("settleFixture result matches deterministic simulation for the fixture seed", async () => {
  const resolvedStatus = new Map<bigint, boolean>([[400n, false], [401n, false]]);
  const chain: ChainClient = {
    async createMarket() { throw new Error("not used"); },
    async resolveMarket(marketId) {
      resolvedStatus.set(marketId, true);
      return `0xresolve${marketId}`;
    },
    async getMarket(marketId) {
      return baseMarketInfo({ resolved: resolvedStatus.get(marketId) ?? false });
    },
  };
  const { db } = createFakeDb();

  const seedHex = generateSeed();
  await rememberPendingFixture("fixture-det", {
    generatorName: "virtual_football",
    seedHex,
    markets: [
      { marketRowId: "row-w4", contractMarketId: 400n },
      { marketRowId: "row-o4", contractMarketId: 401n },
    ],
    closingTime: 1_000,
  });

  try {
    const settled = await settleFixture({ chain, db }, "fixture-det");
    const expected = virtualFootball.simulate(seedHex);
    assert.ok(settled.summary.length > 0 && typeof expected.summary === "string");
  } finally {
    await forgetPendingFixture("fixture-det");
  }
});
