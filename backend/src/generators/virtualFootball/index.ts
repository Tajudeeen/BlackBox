import type { Generator, GeneratorMarket, GeneratorResult } from "../types.js";
import { nextUniform } from "./randomness.js";

const HOME_TEAM = "BLACK FC";
const AWAY_TEAM = "GOLD FC";
const GOAL_LINE = 2.5;
const LAMBDA_HOME = 1.4;
const LAMBDA_AWAY = 1.15;

function samplePoisson(lambda: number, seedHex: string, cursor: { index: number }): number {
  const threshold = Math.exp(-lambda);
  let product = 1;
  let goals = -1;
  do {
    goals += 1;
    product *= nextUniform(seedHex, cursor.index);
    cursor.index += 1;
  } while (product > threshold);
  return goals;
}

const WINNER_OUTCOME_LABELS = [`${HOME_TEAM} win`, "Draw", `${AWAY_TEAM} win`];
const OVER_UNDER_OUTCOME_LABELS = [`Under ${GOAL_LINE} goals`, `Over ${GOAL_LINE} goals`];

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
    const cursor = { index: 0 };
    const homeGoals = samplePoisson(LAMBDA_HOME, seedHex, cursor);
    const awayGoals = samplePoisson(LAMBDA_AWAY, seedHex, cursor);

    let winnerOutcome: number;
    if (homeGoals > awayGoals) winnerOutcome = 0; // HOME
    else if (homeGoals < awayGoals) winnerOutcome = 2; // AWAY
    else winnerOutcome = 1; // DRAW

    const total = homeGoals + awayGoals;
    const overUnderOutcome = total > GOAL_LINE ? 1 : 0;

    const winnerLabel = WINNER_OUTCOME_LABELS[winnerOutcome];
    const ouLabel = OVER_UNDER_OUTCOME_LABELS[overUnderOutcome];

    return {
      outcomes: [winnerOutcome, overUnderOutcome],
      summary: `${HOME_TEAM} ${homeGoals}-${awayGoals} ${AWAY_TEAM} (${winnerLabel}, ${ouLabel})`,
    };
  },
};
