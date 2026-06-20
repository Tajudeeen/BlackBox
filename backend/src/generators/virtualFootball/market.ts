/**
 * Market configuration for the virtual football generator. Kept
 * deliberately simple, per the Phase 3 brief: two teams, one Winner
 * market, one Over/Under market.
 */
export const HOME_TEAM = "BLACK FC";
export const AWAY_TEAM = "GOLD FC";

/** Total-goals line for the Over/Under market. */
export const GOAL_LINE = 2.5;

export const WINNER_EVENT_TYPE = "virtual_football_winner";
export const OVER_UNDER_EVENT_TYPE = "virtual_football_over_under";

export const WINNER_LABEL = `${HOME_TEAM} vs ${AWAY_TEAM} -- Winner`;
export const OVER_UNDER_LABEL = `${HOME_TEAM} vs ${AWAY_TEAM} -- Total Goals Over/Under ${GOAL_LINE}`;

/** Outcome indices for the Winner market, matching BlackboxMarket's outcomeOddsBps order. */
export const WINNER_OUTCOMES = { HOME: 0, DRAW: 1, AWAY: 2 } as const;
export const WINNER_OUTCOME_LABELS = [`${HOME_TEAM} win`, "Draw", `${AWAY_TEAM} win`];
/** Fixed payout multipliers in basis points (10_000 = 1x): home, draw, away. */
export const WINNER_ODDS_BPS = [21_000, 32_000, 29_000];

/** Outcome indices for the Over/Under market. */
export const OVER_UNDER_OUTCOMES = { UNDER: 0, OVER: 1 } as const;
export const OVER_UNDER_OUTCOME_LABELS = [`Under ${GOAL_LINE} goals`, `Over ${GOAL_LINE} goals`];
/** Fixed payout multipliers in basis points: under, over. */
export const OVER_UNDER_ODDS_BPS = [19_000, 19_000];

export type MatchResult = {
  homeGoals: number;
  awayGoals: number;
  winnerOutcome: number;
  overUnderOutcome: number;
};

/** Builds a public, non-financial summary of a settled fixture. */
export function describeOutcome(result: MatchResult): string {
  const winnerLabel = WINNER_OUTCOME_LABELS[result.winnerOutcome];
  const overUnderLabel = OVER_UNDER_OUTCOME_LABELS[result.overUnderOutcome];
  return (
    `${HOME_TEAM} ${result.homeGoals} - ${result.awayGoals} ${AWAY_TEAM} ` +
    `(${winnerLabel}, ${overUnderLabel})`
  );
}
