/**
 * Outcome labels per market eventType, mirroring
 * backend/src/generators/virtualFootball/market.ts. Hand-maintained for
 * the same reason as lib/contract.ts: the frontend and backend packages
 * have independent dependency trees.
 */
export const WINNER_EVENT_TYPE = "virtual_football_winner";
export const OVER_UNDER_EVENT_TYPE = "virtual_football_over_under";

const OUTCOME_LABELS: Record<string, string[]> = {
  [WINNER_EVENT_TYPE]: ["BLACK FC win", "Draw", "GOLD FC win"],
  [OVER_UNDER_EVENT_TYPE]: ["Under 2.5 goals", "Over 2.5 goals"],
};

/** Human-readable label for an outcome index within a given market eventType. */
export function outcomeLabel(eventType: string, outcomeIndex: number): string {
  const labels = OUTCOME_LABELS[eventType];
  if (labels && labels[outcomeIndex] !== undefined) {
    return labels[outcomeIndex];
  }
  return `Outcome ${outcomeIndex}`;
}

/** All outcome labels for a given market eventType, in outcome-index order. */
export function outcomeLabels(eventType: string, outcomeCount: number): string[] {
  const labels = OUTCOME_LABELS[eventType];
  if (labels) return labels;
  return Array.from({ length: outcomeCount }, (_, i) => `Outcome ${i}`);
}
