import type { Generator, GeneratorMarket, GeneratorResult } from "../types.js";
import { simulateMarkets } from "../v2.js";



const DOGS = [
  { name: "Blaze",   oddsBps: 19_000 },
  { name: "Shadow",  oddsBps: 24_000 },
  { name: "Storm",   oddsBps: 28_000 },
  { name: "Rocket",  oddsBps: 35_000 },
  { name: "Ghost",   oddsBps: 42_000 },
  { name: "Thunder", oddsBps: 55_000 },
];






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
    return simulateMarkets(this.getMarkets().map(m => m.eventType), seedHex);
  },
};
