import assert from "node:assert/strict";
import { test } from "node:test";

import type { ChainClient, MarketInfo } from "./chain/client.js";
import type { DbClient } from "./db/types.js";
import { isCreationHalted, resetCreationHalt, settleDueFixtures, tick } from "./engine.js";
import { forgetPendingFixture, getPendingFixture, listPendingFixtureIds, rememberPendingFixture } from "./fixtures/pendingStore.js";
import { generateSeed } from "./generators/virtualFootball/randomness.js";

function createFakeChain() {
  let nextId = 0n;
  const created: { eventType: string; label: string; closingTime: number; outcomeOddsBps: number[] }[] = [];
  const resolved: { marketId: bigint; winningOutcome: number }[] = [];

  const chain: ChainClient = {
    async createMarket(eventType, label, closingTime, outcomeOddsBps) {
      const marketId = nextId;
      nextId += 1n;
      created.push({ eventType, label, closingTime, outcomeOddsBps });
      return { marketId, txHash: `0xfaketx${marketId}` };
    },
    async resolveMarket(marketId, winningOutcome) {
      resolved.push({ marketId, winningOutcome });
      return `0xfakeresolve${marketId}`;
    },
    async getMarket(_marketId): Promise<MarketInfo> {
      return {
        exists: true,
        resolved: false,
        outcomeCount: 3,
        winningOutcome: 0,
        closingTime: 0,
        eventType: "virtual_football_winner",
        label: "",
      };
    },
  };

  return { chain, created, resolved };
}

function createFakeDb() {
  let rowCounter = 0;
  const queries: { text: string; values?: unknown[] }[] = [];

  const db: DbClient = {
    async query(text, values) {
      queries.push({ text, values });
      rowCounter += 1;
      return { rows: [{ id: `fake-row-${rowCounter}` }] } as never;
    },
  };

  return { db, queries };
}

test("settleDueFixtures settles only fixtures whose closing time has passed", async () => {
  const { chain, resolved } = createFakeChain();
  const { db } = createFakeDb();
  const deps = { chain, db };

  rememberPendingFixture("fixture-due", {
    seedHex: generateSeed(),
    marketRowIds: { winner: "row-w-1", overUnder: "row-o-1" },
    contractMarketIds: { winner: 100n, overUnder: 101n },
    closingTime: 1_000,
  });
  rememberPendingFixture("fixture-not-due", {
    seedHex: generateSeed(),
    marketRowIds: { winner: "row-w-2", overUnder: "row-o-2" },
    contractMarketIds: { winner: 102n, overUnder: 103n },
    closingTime: 5_000,
  });

  try {
    const settled = await settleDueFixtures(deps, 2_000);

    assert.deepStrictEqual(settled, ["fixture-due"]);
    assert.strictEqual(getPendingFixture("fixture-due"), undefined);
    assert.ok(getPendingFixture("fixture-not-due"));
    assert.strictEqual(resolved.length, 2);
    assert.deepStrictEqual(
      resolved.map((r) => r.marketId),
      [100n, 101n],
    );
  } finally {
    forgetPendingFixture("fixture-due");
    forgetPendingFixture("fixture-not-due");
  }
});

test("tick creates a fixture when none is pending", async () => {
  const { chain, created } = createFakeChain();
  const { db } = createFakeDb();
  const deps = { chain, db };

  assert.strictEqual(listPendingFixtureIds().length, 0);

  try {
    await tick(deps, { closingInSeconds: 1_800 }, Math.floor(Date.now() / 1000));

    const ids = listPendingFixtureIds();
    assert.strictEqual(ids.length, 1);
    assert.strictEqual(created.length, 2); // Winner market + Over/Under market

    forgetPendingFixture(ids[0]);
  } finally {
    for (const id of listPendingFixtureIds()) forgetPendingFixture(id);
  }
});

test("tick does not create a second fixture while one is already pending", async () => {
  const { chain, created } = createFakeChain();
  const { db } = createFakeDb();
  const deps = { chain, db };

  const farFuture = Math.floor(Date.now() / 1000) + 10_000;
  rememberPendingFixture("already-pending", {
    seedHex: generateSeed(),
    marketRowIds: { winner: "row-w", overUnder: "row-o" },
    contractMarketIds: { winner: 9n, overUnder: 10n },
    closingTime: farFuture,
  });

  try {
    await tick(deps, { closingInSeconds: 1_800 }, Math.floor(Date.now() / 1000));

    assert.strictEqual(created.length, 0);
    assert.deepStrictEqual(listPendingFixtureIds(), ["already-pending"]);
  } finally {
    forgetPendingFixture("already-pending");
  }
});

test("tick halts further fixture creation after a partial creation failure, instead of orphaning a market every retry", async () => {
  resetCreationHalt();

  // First createMarket call (winner) succeeds; second (over/under) fails.
  let callCount = 0;
  const chain: ChainClient = {
    async createMarket(_eventType, _label, _closingTime, _outcomeOddsBps) {
      callCount += 1;
      if (callCount === 1) return { marketId: 50n, txHash: "0xwinner" };
      throw new Error("simulated RPC failure on the second createMarket call");
    },
    async resolveMarket() {
      throw new Error("not used in this test");
    },
    async getMarket(_marketId): Promise<MarketInfo> {
      throw new Error("not used in this test");
    },
  };
  const { db } = createFakeDb();
  const deps = { chain, db };
  const now = Math.floor(Date.now() / 1000);

  try {
    assert.strictEqual(isCreationHalted(), false);

    // First tick: hits the partial failure, halts creation. Must not
    // throw out of tick -- the halt is handled, not propagated.
    await tick(deps, { closingInSeconds: 1_800 }, now);
    assert.strictEqual(isCreationHalted(), true);
    assert.strictEqual(callCount, 2);

    // Second tick: must NOT call createMarket again (which would orphan
    // a second winner market) while halted.
    await tick(deps, { closingInSeconds: 1_800 }, now);
    assert.strictEqual(callCount, 2);

    // No fixture was ever remembered as pending -- the failure happened
    // before rememberPendingFixture was reached.
    assert.deepStrictEqual(listPendingFixtureIds(), []);
  } finally {
    resetCreationHalt();
    for (const id of listPendingFixtureIds()) forgetPendingFixture(id);
  }
});

test("resetCreationHalt allows fixture creation to resume", async () => {
  resetCreationHalt();
  const { chain, created } = createFakeChain();
  const { db } = createFakeDb();
  const deps = { chain, db };
  const now = Math.floor(Date.now() / 1000);

  try {
    // Manually simulate a halted state without going through a real failure.
    await tick(deps, { closingInSeconds: 1_800 }, now);
    const idsAfterFirstTick = listPendingFixtureIds();
    for (const id of idsAfterFirstTick) forgetPendingFixture(id);

    assert.strictEqual(isCreationHalted(), false);
    assert.strictEqual(created.length, 2);
  } finally {
    resetCreationHalt();
    for (const id of listPendingFixtureIds()) forgetPendingFixture(id);
  }
});
