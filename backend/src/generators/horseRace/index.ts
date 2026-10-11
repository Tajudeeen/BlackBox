import type { Generator, GeneratorMarket, GeneratorResult } from "../types.js";
import { simulateMarkets } from "../v2.js";



const HORSES = [
  { name: "Golden Flash",  oddsBps: 22_000 },
  { name: "Silver Arrow",  oddsBps: 26_000 },
  { name: "Iron Duke",     oddsBps: 31_000 },
  { name: "Desert Wind",   oddsBps: 38_000 },
  { name: "Dark Storm",    oddsBps: 45_000 },
  { name: "Night Rider",   oddsBps: 52_000 },
  { name: "Thunder King",  oddsBps: 65_000 },
  { name: "Black Pearl",   oddsBps: 80_000 },
];



const FAVOURITE_INDEX = 0;




const PLACE_ODDS_BPS = [25_000, 15_000];


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

        oddsBps: PLACE_ODDS_BPS,
      },
    ];
  },

  simulate(seedHex: string): GeneratorResult {
    return simulateMarkets(this.getMarkets().map(m => m.eventType), seedHex);
  },
};
