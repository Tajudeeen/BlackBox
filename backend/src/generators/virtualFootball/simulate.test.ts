import assert from "node:assert/strict";
import { test } from "node:test";

import { OVER_UNDER_OUTCOMES, WINNER_OUTCOMES } from "./market.js";
import { generateSeed } from "./randomness.js";
import { simulateMatch } from "./simulate.js";

test("simulateMatch is deterministic for a given seed", () => {
  const seed = generateSeed();
  const first = simulateMatch(seed);
  const second = simulateMatch(seed);
  assert.deepStrictEqual(first, second);
});

test("simulateMatch produces non-negative integer goal counts", () => {
  for (let trial = 0; trial < 200; trial += 1) {
    const result = simulateMatch(generateSeed());
    assert.ok(Number.isInteger(result.homeGoals) && result.homeGoals >= 0);
    assert.ok(Number.isInteger(result.awayGoals) && result.awayGoals >= 0);
  }
});

test("simulateMatch derives the winner outcome consistently with the goal counts", () => {
  for (let trial = 0; trial < 200; trial += 1) {
    const result = simulateMatch(generateSeed());
    if (result.homeGoals > result.awayGoals) {
      assert.strictEqual(result.winnerOutcome, WINNER_OUTCOMES.HOME);
    } else if (result.homeGoals < result.awayGoals) {
      assert.strictEqual(result.winnerOutcome, WINNER_OUTCOMES.AWAY);
    } else {
      assert.strictEqual(result.winnerOutcome, WINNER_OUTCOMES.DRAW);
    }
  }
});

test("simulateMatch derives the over/under outcome consistently with total goals", () => {
  for (let trial = 0; trial < 200; trial += 1) {
    const result = simulateMatch(generateSeed());
    const total = result.homeGoals + result.awayGoals;
    const expected = total > 2.5 ? OVER_UNDER_OUTCOMES.OVER : OVER_UNDER_OUTCOMES.UNDER;
    assert.strictEqual(result.overUnderOutcome, expected);
  }
});

test("simulateMatch produces a plausible goal distribution over many trials", () => {
  const trials = 4000;
  let homeGoalsTotal = 0;
  let awayGoalsTotal = 0;
  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;

  for (let i = 0; i < trials; i += 1) {
    const result = simulateMatch(generateSeed());
    homeGoalsTotal += result.homeGoals;
    awayGoalsTotal += result.awayGoals;
    if (result.winnerOutcome === WINNER_OUTCOMES.HOME) homeWins += 1;
    else if (result.winnerOutcome === WINNER_OUTCOMES.DRAW) draws += 1;
    else awayWins += 1;
  }

  const meanHomeGoals = homeGoalsTotal / trials;
  const meanAwayGoals = awayGoalsTotal / trials;

  // Expected goals are 1.4 (home) and 1.15 (away). Generous bounds to avoid
  // a flaky test while still catching a broken implementation (e.g. a
  // sampler stuck at zero, or one that ignores its lambda entirely).
  assert.ok(meanHomeGoals > 1.0 && meanHomeGoals < 1.8, `meanHomeGoals was ${meanHomeGoals}`);
  assert.ok(meanAwayGoals > 0.8 && meanAwayGoals < 1.5, `meanAwayGoals was ${meanAwayGoals}`);

  const homeWinRate = homeWins / trials;
  const drawRate = draws / trials;
  const awayWinRate = awayWins / trials;
  assert.ok(homeWinRate > 0.25 && homeWinRate < 0.55, `homeWinRate was ${homeWinRate}`);
  assert.ok(drawRate > 0.15 && drawRate < 0.45, `drawRate was ${drawRate}`);
  assert.ok(awayWinRate > 0.15 && awayWinRate < 0.45, `awayWinRate was ${awayWinRate}`);
});
