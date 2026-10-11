import assert from 'node:assert/strict';
import {test} from 'node:test';
import {id, keccak256} from 'ethers';
import {GENERATORS} from '../generators/registry.js';
import {simulateV2} from '../generated/protocol.mjs';
for (const generator of GENERATORS) test(`${generator.name}: shared protocol parity over 24 seeds`, () => {
  for (let i = 0; i < 24; i++) {
    const seed = id(`vector:${i}`);
    assert.deepEqual(generator.simulate(seed).outcomes, generator.getMarkets().map(m => simulateV2(m.eventType, seed, keccak256)));
  }
});
test('rejects malformed seeds and unsupported event types', () => {
  assert.throws(() => simulateV2('virtual_football_winner', '0x12', keccak256));
  assert.throws(() => simulateV2('unknown', id('seed'), keccak256));
});
