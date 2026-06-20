import assert from "node:assert/strict";
import { test } from "node:test";

import type { ChainClient, MarketInfo } from "../chain/client.js";
import type { DbClient } from "../db/types.js";
import { generateSeed } from "../generators/virtualFootball/randomness.js";
import { simulateMatch } from "../generators/virtualFootball/simulate.js";
import { forgetPendingFixture, getPendingFixture, rememberPendingFixture } from "./pendingStore.js";
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
    async createMarket() {
      throw new Error("not used in this test");
    },
    async resolveMarket(marketId, _winningOutcome) {
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
  rememberPendingFixture("fixture-fresh", {
    seedHex,
    marketRowIds: { winner: "row-w", overUnder: "row-o" },
    contractMarketIds: { winner: 200n, overUnder: 201n },
    closingTime: 1_000,
  });

  try {
    await settleFixture({ chain, db }, "fixture-fresh");
    assert.deepStrictEqual(resolved, [200n, 201n]);
    assert.strictEqual(getPendingFixture("fixture-fresh"), undefined);
  } finally {
    forgetPendingFixture("fixture-fresh");
  }
});

test("settleFixture does not re-resolve a market that is already resolved on chain, and still resolves the one that is not", async () => {
  // Simulates retrying after a previous attempt resolved the winner
  // market on chain but crashed before resolving the over/under market or
  // forgetting the pending fixture.
  const resolveCalls: bigint[] = [];
  const resolvedStatus = new Map<bigint, boolean>([
    [300n, true], // winner market: already resolved from a prior attempt
    [301n, false], // over/under market: not resolved yet
  ]);
  const chain: ChainClient = {
    async createMarket() {
      throw new Error("not used in this test");
    },
    async resolveMarket(marketId, _winningOutcome) {
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
  rememberPendingFixture("fixture-partial", {
    seedHex,
    marketRowIds: { winner: "row-w2", overUnder: "row-o2" },
    contractMarketIds: { winner: 300n, overUnder: 301n },
    closingTime: 1_000,
  });

  try {
    await settleFixture({ chain, db }, "fixture-partial");

    // Only the still-unresolved over/under market should have been
    // resolved by this call. If the already-resolved winner market had
    // been called again, this would be [300n, 301n] and (in the real
    // contract) would have reverted before 301n was ever attempted.
    assert.deepStrictEqual(resolveCalls, [301n]);
    assert.strictEqual(getPendingFixture("fixture-partial"), undefined);
  } finally {
    forgetPendingFixture("fixture-partial");
  }
});

test("settleFixture is safe to call twice in a row (both markets already resolved on the second call)", async () => {
  const resolveCalls: bigint[] = [];
  const resolvedStatus = new Map<bigint, boolean>([
    [400n, false],
    [401n, false],
  ]);
  const chain: ChainClient = {
    async createMarket() {
      throw new Error("not used in this test");
    },
    async resolveMarket(marketId, _winningOutcome) {
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
  const fixture = {
    seedHex,
    marketRowIds: { winner: "row-w3", overUnder: "row-o3" },
    contractMarketIds: { winner: 400n, overUnder: 401n },
    closingTime: 1_000,
  };

  rememberPendingFixture("fixture-twice", fixture);
  try {
    await settleFixture({ chain, db }, "fixture-twice");
    assert.deepStrictEqual(resolveCalls, [400n, 401n]);

    // Re-remember it, simulating the engine retrying before it learned
    // the first attempt actually succeeded.
    rememberPendingFixture("fixture-twice", fixture);
    await settleFixture({ chain, db }, "fixture-twice");

    // No new resolveMarket calls on the second pass -- both were already
    // resolved on chain.
    assert.deepStrictEqual(resolveCalls, [400n, 401n]);
  } finally {
    forgetPendingFixture("fixture-twice");
  }
});

test("settleFixture's recomputed result still matches the deterministic simulation for the fixture's seed", async () => {
  const resolvedStatus = new Map<bigint, boolean>([
    [500n, false],
    [501n, false],
  ]);
  const chain: ChainClient = {
    async createMarket() {
      throw new Error("not used in this test");
    },
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
  rememberPendingFixture("fixture-deterministic", {
    seedHex,
    marketRowIds: { winner: "row-w4", overUnder: "row-o4" },
    contractMarketIds: { winner: 500n, overUnder: 501n },
    closingTime: 1_000,
  });

  try {
    const settled = await settleFixture({ chain, db }, "fixture-deterministic");
    assert.deepStrictEqual(settled.result, simulateMatch(seedHex));
  } finally {
    forgetPendingFixture("fixture-deterministic");
  }
});
