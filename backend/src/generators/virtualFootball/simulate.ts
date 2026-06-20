/**
 * Deterministic virtual football match simulation.
 *
 * Goal counts are drawn from independent Poisson distributions, the same
 * model widely used for real football score prediction, with a mild home
 * advantage baked into the expected-goals constants below. The simulation
 * is a pure function of the seed: the same seed always produces the same
 * goals, every time, in any JavaScript runtime, which is what lets a
 * participant independently re-run it against a revealed seed and check
 * the engine's submitted outcome.
 */
import { GOAL_LINE, OVER_UNDER_OUTCOMES, WINNER_OUTCOMES, type MatchResult } from "./market.js";
import { nextUniform } from "./randomness.js";

/** Expected goals for the home and away side. A mild home advantage. */
const LAMBDA_HOME = 1.4;
const LAMBDA_AWAY = 1.15;

/**
 * Draws one Poisson-distributed sample using Knuth's algorithm, consuming
 * pseudorandom words from the seed's stream starting at `cursor.index`.
 */
function samplePoisson(lambda: number, seedHex: string, cursor: { index: number }): number {
  const threshold = Math.exp(-lambda);
  let product = 1;
  let goals = -1;

  do {
    goals += 1;
    const uniform = nextUniform(seedHex, cursor.index);
    cursor.index += 1;
    product *= uniform;
  } while (product > threshold);

  return goals;
}

/** Simulates one match from a seed, returning goals and derived market outcomes. */
export function simulateMatch(seedHex: string): MatchResult {
  const cursor = { index: 0 };
  const homeGoals = samplePoisson(LAMBDA_HOME, seedHex, cursor);
  const awayGoals = samplePoisson(LAMBDA_AWAY, seedHex, cursor);

  let winnerOutcome: number;
  if (homeGoals > awayGoals) {
    winnerOutcome = WINNER_OUTCOMES.HOME;
  } else if (homeGoals < awayGoals) {
    winnerOutcome = WINNER_OUTCOMES.AWAY;
  } else {
    winnerOutcome = WINNER_OUTCOMES.DRAW;
  }

  const totalGoals = homeGoals + awayGoals;
  const overUnderOutcome = totalGoals > GOAL_LINE ? OVER_UNDER_OUTCOMES.OVER : OVER_UNDER_OUTCOMES.UNDER;

  return { homeGoals, awayGoals, winnerOutcome, overUnderOutcome };
}
