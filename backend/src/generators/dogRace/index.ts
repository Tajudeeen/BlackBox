import type { Generator, GeneratorMarket, GeneratorResult } from "../types.js";
import { nextUniform } from "../virtualFootball/randomness.js";

// Dogs ordered from favourite to underdog.
// Odds in basis points (10_000 = 1x). Lower odds = more likely to win.
const DOGS = [
  { name: "Blaze",   oddsBps: 19_000 }, // favourite  ~1.9x
  { name: "Shadow",  oddsBps: 24_000 }, // 2nd fav    ~2.4x
  { name: "Storm",   oddsBps: 28_000 }, // mid        ~2.8x
  { name: "Rocket",  oddsBps: 35_000 }, // mid-long   ~3.5x
  { name: "Ghost",   oddsBps: 42_000 }, // longshot   ~4.2x
  { name: "Thunder", oddsBps: 55_000 }, // rank outsider ~5.5x
];

// Base speeds directly mirror the odds: higher base speed = lower odds = more likely to win.
// Values chosen so the statistical win rates approximately match the implied probabilities.
// e.g. Blaze at 1.9x implies ~1/1.9 = 52% win rate, so it needs the highest base speed.
const BASE_SPEEDS = [1.20, 1.10, 1.02, 0.94, 0.86, 0.76];

function sampleNormal(seedHex: string, cursor: { index: number }): number {
  const u1 = nextUniform(seedHex, cursor.index++);
  const u2 = nextUniform(seedHex, cursor.index++);
  return Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
}

export const dogRace: Generator = {
  name: "dog_race",

  getMarkets(): GeneratorMarket[] {
    return [
      {
        eventType: "dog_race_winner",
        label: "Virtual Dog Race — Race Winner",
        oddsBps: DOGS.map((d) => d.oddsBps),
      },
    ];
  },

  simulate(seedHex: string): GeneratorResult {
    const cursor = { index: 0 };

    const speeds = DOGS.map((_, i) => BASE_SPEEDS[i] + sampleNormal(seedHex, cursor) * 0.12);

    const finishOrder = speeds
      .map((speed, i) => ({ name: DOGS[i].name, speed, index: i }))
      .sort((a, b) => b.speed - a.speed);

    const winnerIndex = finishOrder[0].index;

    return {
      outcomes: [winnerIndex],
      summary: `${DOGS[winnerIndex].name} wins. Order: ${finishOrder.map((d) => d.name).join(", ")}`,
    };
  },
};
