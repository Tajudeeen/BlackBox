import assert from "node:assert/strict";
import { test } from "node:test";

import { commitSeed, generateSeed, nextUniform, verifyReveal } from "./randomness.js";

test("generateSeed produces a 32-byte hex string", () => {
  const seed = generateSeed();
  assert.match(seed, /^0x[0-9a-f]{64}$/);
});

test("generateSeed produces different seeds across calls", () => {
  const seedA = generateSeed();
  const seedB = generateSeed();
  assert.notStrictEqual(seedA, seedB);
});

test("commitSeed is deterministic", () => {
  const seed = generateSeed();
  assert.strictEqual(commitSeed(seed), commitSeed(seed));
});

test("commitSeed produces different commitments for different seeds", () => {
  const commitmentA = commitSeed(generateSeed());
  const commitmentB = commitSeed(generateSeed());
  assert.notStrictEqual(commitmentA, commitmentB);
});

test("verifyReveal accepts a seed that matches its own commitment", () => {
  const seed = generateSeed();
  const commitment = commitSeed(seed);
  assert.strictEqual(verifyReveal(seed, commitment), true);
});

test("verifyReveal rejects a seed that does not match the commitment", () => {
  const seed = generateSeed();
  const commitment = commitSeed(generateSeed());
  assert.strictEqual(verifyReveal(seed, commitment), false);
});

test("nextUniform is deterministic for a given seed and index", () => {
  const seed = generateSeed();
  assert.strictEqual(nextUniform(seed, 0), nextUniform(seed, 0));
  assert.strictEqual(nextUniform(seed, 7), nextUniform(seed, 7));
});

test("nextUniform stays within [0, 1)", () => {
  const seed = generateSeed();
  for (let i = 0; i < 50; i += 1) {
    const value = nextUniform(seed, i);
    assert.ok(value >= 0 && value < 1, `expected ${value} to be in [0, 1)`);
  }
});

test("nextUniform varies across indices for the same seed", () => {
  const seed = generateSeed();
  const values = new Set(Array.from({ length: 20 }, (_, i) => nextUniform(seed, i)));
  assert.ok(values.size > 1, "expected successive draws to differ");
});
