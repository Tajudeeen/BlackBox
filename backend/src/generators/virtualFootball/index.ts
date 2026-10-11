import type { Generator, GeneratorMarket, GeneratorResult } from "../types.js";
import { simulateMarkets } from "../v2.js";

const HOME_TEAM = "BLACK FC";
const AWAY_TEAM = "GOLD FC";
const GOAL_LINE = 2.5;



export const virtualFootball: Generator = {
  name: "virtual_football",

  getMarkets(): GeneratorMarket[] {
    return [
      {
        eventType: "virtual_football_winner",
        label: `${HOME_TEAM} vs ${AWAY_TEAM} -- Winner`,
        oddsBps: [21_000, 32_000, 29_000],
      },
      {
        eventType: "virtual_football_over_under",
        label: `${HOME_TEAM} vs ${AWAY_TEAM} -- Total Goals Over/Under ${GOAL_LINE}`,
        oddsBps: [19_000, 19_000],
      },
    ];
  },

  simulate(seedHex: string): GeneratorResult {
    return simulateMarkets(this.getMarkets().map(m => m.eventType), seedHex);
  },
};
