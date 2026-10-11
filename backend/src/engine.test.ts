import assert from 'node:assert/strict';
import {beforeEach, test} from 'node:test';
import {keccak256} from 'ethers';
import {CreationExpiredError, type ChainClient, type MarketInfo} from './chain/client.js';
import type {DbClient} from './db/types.js';
import {createFixture, resumeCreation} from './fixtures/runFixture.js';
import {settleFixture} from './fixtures/settleFixture.js';
import {clearAllPendingFixtures, getPendingFixture, listPendingFixtureIds, loadPendingFixturesIntoMemory, type PendingFixture} from './fixtures/pendingStore.js';
import {virtualFootball} from './generators/virtualFootball/index.js';
import {simulateV2} from './generated/protocol.mjs';
import {tick} from './engine.js';
beforeEach(clearAllPendingFixtures);
function harness() {
  const durable = new Map<string, PendingFixture>();
  const markets = new Map<bigint, MarketInfo>();
  const keys = new Map<string, bigint>();
  const faults = {save: false, remove: false, receipt: false, second: false, expired: false, blocked: false};
  let creations = 0, resolutions = 0, cancellations = 0;
  const db: DbClient = {async query(sql, args = []) {
    if (sql.startsWith('INSERT INTO v2_pending_fixtures')) {
      if (faults.save) throw new Error('database unavailable');
      durable.set(String(args[0]), {generatorName: String(args[1]), seedHex: String(args[2]),
        markets: JSON.parse(String(args[3])).map((m: {marketRowId: string; contractMarketId: string}) => ({...m, contractMarketId: BigInt(m.contractMarketId)})), closingTime: Number(args[4])});
    }
    if (sql.startsWith('DELETE FROM v2_pending_fixtures')) {
      if (faults.remove) throw new Error('database unavailable');
      durable.delete(String(args[0]));
    }
    return {rows: sql.startsWith('INSERT INTO v2_markets') ? [{id: `row:${args[0]}`}] : []} as never;
  }};
  const chain: ChainClient = {
    async createMarket(eventType, label, closingTime, odds, commitment, key) {
      if (faults.blocked) throw new Error('RPC unavailable');
      if (keys.has(key)) return {marketId: keys.get(key)!, txHash: 'recovered'};
      if (faults.expired) throw new CreationExpiredError();
      if (faults.second && creations === 1) throw new Error('second market failed');
      assert.ok(durable.size > 0, 'durable seed must exist before any transaction');
      const marketId = BigInt(creations++);
      keys.set(key, marketId);
      markets.set(marketId, {exists: true, resolved: false, outcomeCount: odds.length, winningOutcome: 0, closingTime, eventType, label, commitment, cancelled: false});
      if (faults.receipt) {faults.receipt = false; throw new Error('lost receipt');}
      return {marketId, txHash: 'created'};
    },
    async getMarket(id) {return {...markets.get(id)!};},
    async resolveMarket(id, seed) {
      const m = markets.get(id)!;
      assert.equal(keccak256(seed), m.commitment);
      m.winningOutcome = simulateV2(m.eventType, seed, keccak256); m.resolved = true; resolutions++;
      return 'resolved';
    },
    async cancelExpired(id) {const m = markets.get(id)!; m.resolved = true; m.cancelled = true; cancellations++; return 'cancelled';}
  };
  return {db, chain, durable, markets, faults, counts: () => ({creations, resolutions, cancellations})};
}
test('does not create a market unless its secret seed is durable', async () => {
  const h = harness(); h.faults.save = true;
  await assert.rejects(createFixture(h, virtualFootball, 3600));
  assert.equal(h.counts().creations, 0); assert.equal(listPendingFixtureIds().length, 0);
});
test('recovers a mined transaction with a lost receipt after process restart', async () => {
  const h = harness(); h.faults.receipt = true;
  await assert.rejects(createFixture(h, virtualFootball, 3600));
  assert.equal(h.counts().creations, 1);
  loadPendingFixturesIntoMemory(h.durable);
  const id = listPendingFixtureIds()[0];
  await resumeCreation(h, id);
  assert.equal(h.counts().creations, 2);
  assert.equal(getPendingFixture(id)?.markets.length, 2);
  await resumeCreation(h, id); assert.equal(h.counts().creations, 2);
});
test('retains recoverable intent when checkpoint update fails', async () => {
  const h = harness(); h.faults.receipt = true;
  await assert.rejects(createFixture(h, virtualFootball, 3600));
  const id = listPendingFixtureIds()[0]; h.faults.save = true;
  await assert.rejects(resumeCreation(h, id));
  assert.equal(getPendingFixture(id)?.markets.length, 0);
  h.faults.save = false; await resumeCreation(h, id);
  assert.equal(h.counts().creations, 2);
});
test('settles the recovered prefix when the remaining creation window expires', async () => {
  const h = harness(); h.faults.second = true;
  await assert.rejects(createFixture(h, virtualFootball, 3600));
  const id = listPendingFixtureIds()[0]; h.faults.second = false; h.faults.expired = true;
  await resumeCreation(h, id); await settleFixture(h, id);
  assert.equal(h.counts().resolutions, 1); assert.equal(h.durable.size, 0);
});
test('keeps memory and durable record until deletion succeeds, without resolving twice', async () => {
  const h = harness(); const f = await createFixture(h, virtualFootball, 3600);
  h.faults.remove = true; await assert.rejects(settleFixture(h, f.fixtureId));
  assert.ok(getPendingFixture(f.fixtureId)); assert.equal(h.counts().resolutions, 2);
  h.faults.remove = false; await settleFixture(h, f.fixtureId);
  assert.equal(h.counts().resolutions, 2); assert.equal(h.durable.size, 0);
});
test('refuses conflicting commitment and conflicting resolved outcome', async () => {
  const h = harness(); const f = await createFixture(h, virtualFootball, 3600);
  const m = h.markets.get(0n)!; const commitment = m.commitment;
  m.commitment = '0xdead'; await assert.rejects(settleFixture(h, f.fixtureId));
  m.commitment = commitment; m.resolved = true; m.winningOutcome = 255;
  await assert.rejects(settleFixture(h, f.fixtureId)); assert.ok(getPendingFixture(f.fixtureId));
});
test('blocked pending generators do not create an unbounded stream of new fixtures', async () => {
  const h = harness(); h.faults.blocked = true;
  await tick(h, {closingInSeconds: 30}, 0);
  assert.equal(h.durable.size, 3);
  await tick(h, {closingInSeconds: 30}, Number.MAX_SAFE_INTEGER);
  assert.equal(h.durable.size, 3); assert.equal(h.counts().creations, 0);
});
test('expired reveals cancel instead of choosing an arbitrary result', async () => {
  const h = harness(); const f = await createFixture(h, virtualFootball, -90000);
  await settleFixture(h, f.fixtureId);
  assert.equal(h.counts().resolutions, 0); assert.equal(h.counts().cancellations, 2);
});
