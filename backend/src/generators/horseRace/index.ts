import type { Generator, GeneratorMarket, GeneratorResult } from "../types.js";
import { nextUniform } from "../virtualFootball/randomness.js";

// Horses ordered from favourite to rank outsider.
// Odds in basis points. Lower odds = more likely to win.
const HORSES = [
  { name: "Golden Flash",  oddsBps: 22_000 }, // favourite     ~2.2x
  { name: "Silver Arrow",  oddsBps: 26_000 }, // 2nd fav       ~2.6x
  { name: "Iron Duke",     oddsBps: 31_000 }, // 3rd fav       ~3.1x
  { name: "Desert Wind",   oddsBps: 38_000 }, // mid           ~3.8x
  { name: "Dark Storm",    oddsBps: 45_000 }, // mid-long      ~4.5x
  { name: "Night Rider",   oddsBps: 52_000 }, // longshot      ~5.2x
  { name: "Thunder King",  oddsBps: 65_000 }, // big outsider  ~6.5x
  { name: "Black Pearl",   oddsBps: 80_000 }, // rank outsider ~8.0x
];

// Base speeds mirror odds: highest base speed = lowest odds = favourite.
const BASE_SPEEDS = [1.22, 1.14, 1.07, 0.99, 0.91, 0.83, 0.75, 0.67];

const FAVOURITE_INDEX = 0; // Golden Flash

// Golden Flash place market odds. With the highest base speed, the favourite
// places (finishes top 2) roughly 65% of the time across simulations.
// Place odds: ~1.5x if places, ~2.5x if doesn't place.
const PLACE_ODDS_BPS = [25_000, 15_000]; // [doesn't place, places]

function sampleNormal(seedHex: string, cursor: { index: number }): number {
  const u1 = nextUniform(seedHex, cursor.index++);
  const u2 = nextUniform(seedHex, cursor.index++);
  return Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
}

export const horseRace: Generator = {
  name: "horse_race",

  getMarkets(): GeneratorMarket[] {
    return [
      {
        eventType: "horse_race_winner",
        label: "Virtual Horse Race — Race Winner",
        oddsBps: HORSES.map((h) => h.oddsBps),
      },
      {
        eventType: "horse_race_place",
        label: `Virtual Horse Race — Does ${HORSES[FAVOURITE_INDEX].name} Finish Top 2?`,
        // outcome 0 = does not place, outcome 1 = places
        oddsBps: PLACE_ODDS_BPS,
      },
    ];
  },

  simulate(seedHex: string): GeneratorResult {
    const cursor = { index: 0 };

    const speeds = HORSES.map((_, i) => BASE_SPEEDS[i] + sampleNormal(seedHex, cursor) * 0.14);

    const finishOrder = speeds
      .map((speed, i) => ({ name: HORSES[i].name, speed, index: i }))
      .sort((a, b) => b.speed - a.speed);

    const winnerIndex = finishOrder[0].index;
    const topTwo = [finishOrder[0].index, finishOrder[1].index];
    const favouritePlaces = topTwo.includes(FAVOURITE_INDEX) ? 1 : 0;
    const placeLabel = favouritePlaces ? "places (top 2)" : "does not place";

    return {
      outcomes: [winnerIndex, favouritePlaces],
      summary: `${HORSES[winnerIndex].name} wins. ${HORSES[FAVOURITE_INDEX].name} ${placeLabel}. Order: ${finishOrder.map((h) => h.name).join(", ")}`,
    };
  },
};
