import type { Generator, GeneratorMarket, GeneratorResult } from "../types.js";
import { nextUniform } from "../virtualFootball/randomness.js";

const HORSES = [
  "Iron Duke",
  "Silver Arrow",
  "Dark Storm",
  "Golden Flash",
  "Night Rider",
  "Desert Wind",
  "Thunder King",
  "Black Pearl",
];

// Winner market odds -- 8 horses, varied spread.
const WINNER_ODDS_BPS = [35_000, 28_000, 42_000, 25_000, 55_000, 31_000, 48_000, 60_000];

// Place market (top 2 finisher): two outcomes per horse -- places or doesn't.
// These are for a single "Will the favourite place?" market on horse index 3 (Golden Flash).
const PLACE_ODDS_BPS = [18_000, 22_000];

function sampleSpeed(seedHex: string, cursor: { index: number }): number {
  const u1 = nextUniform(seedHex, cursor.index++);
  const u2 = nextUniform(seedHex, cursor.index++);
  return Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
}

const FAVOURITE_INDEX = 3; // Golden Flash -- lowest winner odds = favourite

export const horseRace: Generator = {
  name: "horse_race",

  getMarkets(): GeneratorMarket[] {
    return [
      {
        eventType: "horse_race_winner",
        label: "Virtual Horse Race -- Race Winner",
        oddsBps: WINNER_ODDS_BPS,
      },
      {
        eventType: "horse_race_place",
        label: `Virtual Horse Race -- Does ${HORSES[FAVOURITE_INDEX]} Place (Top 2)?`,
        oddsBps: PLACE_ODDS_BPS,
      },
    ];
  },

  simulate(seedHex: string): GeneratorResult {
    const cursor = { index: 0 };

    const baseSpeeds = [0.98, 1.04, 0.94, 1.08, 0.88, 1.01, 0.91, 0.85];
    const speeds = HORSES.map((_, i) => baseSpeeds[i] + sampleSpeed(seedHex, cursor) * 0.12);

    const finishOrder = speeds
      .map((speed, i) => ({ name: HORSES[i], index: i, speed }))
      .sort((a, b) => b.speed - a.speed);

    const winnerIndex = finishOrder[0].index;
    const winnerName = HORSES[winnerIndex];

    const topTwo = [finishOrder[0].index, finishOrder[1].index];
    const favouritePlaces = topTwo.includes(FAVOURITE_INDEX) ? 1 : 0; // 1 = placed, 0 = did not place

    const placeLabel = favouritePlaces ? "placed" : "did not place";

    return {
      outcomes: [winnerIndex, favouritePlaces],
      summary: `${winnerName} wins. ${HORSES[FAVOURITE_INDEX]} ${placeLabel}. Order: ${finishOrder
        .map((h) => h.name)
        .join(", ")}`,
    };
  },
};
