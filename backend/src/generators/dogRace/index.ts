import type { Generator, GeneratorMarket, GeneratorResult } from "../types.js";
import { nextUniform } from "../virtualFootball/randomness.js";

const DOGS = ["Shadow", "Blaze", "Rocket", "Storm", "Ghost", "Thunder"];

// Odds reflect a realistic spread -- favourites and underdogs.
// 10_000 bps = 1x. All expressed in basis points.
const WINNER_ODDS_BPS = [28_000, 22_000, 35_000, 31_000, 45_000, 39_000];

// Fastest dog wins. Each dog's speed is sampled from a normal distribution
// using the Box-Muller transform seeded from our commit-reveal seed.
// Same seed always produces the same race. Independently verifiable.
function sampleSpeed(seedHex: string, cursor: { index: number }): number {
  const u1 = nextUniform(seedHex, cursor.index++);
  const u2 = nextUniform(seedHex, cursor.index++);
  // Box-Muller: produces a standard normal sample
  return Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
}

export const dogRace: Generator = {
  name: "dog_race",

  getMarkets(): GeneratorMarket[] {
    return [
      {
        eventType: "dog_race_winner",
        label: "Virtual Dog Race -- Race Winner",
        oddsBps: WINNER_ODDS_BPS,
      },
    ];
  },

  simulate(seedHex: string): GeneratorResult {
    const cursor = { index: 0 };

    // Sample a speed for each dog. Higher = faster.
    const speeds = DOGS.map((_, i) => {
      // Each dog has a slightly different base speed to match the odds spread.
      const baseSpeeds = [1.05, 1.1, 0.98, 1.02, 0.92, 0.96];
      return baseSpeeds[i] + sampleSpeed(seedHex, cursor) * 0.1;
    });

    // Winner is the dog with the highest speed.
    const winnerIndex = speeds.indexOf(Math.max(...speeds));
    const winnerName = DOGS[winnerIndex];

    // Build the finishing order for the summary.
    const finishOrder = speeds
      .map((speed, i) => ({ name: DOGS[i], speed }))
      .sort((a, b) => b.speed - a.speed)
      .map((d) => d.name);

    return {
      outcomes: [winnerIndex],
      summary: `${winnerName} wins. Finishing order: ${finishOrder.join(", ")}`,
    };
  },
};
