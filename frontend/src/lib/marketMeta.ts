/**
 * Human-readable labels for all market event types, mirroring the
 * backend generators. Add a new entry here whenever a new generator
 * is added to backend/src/generators/registry.ts.
 */

// ── Virtual Football ────────────────────────────────────────────────────────
export const WINNER_EVENT_TYPE = "virtual_football_winner";
export const OVER_UNDER_EVENT_TYPE = "virtual_football_over_under";

// ── Dog Race ────────────────────────────────────────────────────────────────
export const DOG_RACE_WINNER_EVENT_TYPE = "dog_race_winner";

// ── Horse Race ──────────────────────────────────────────────────────────────
export const HORSE_RACE_WINNER_EVENT_TYPE = "horse_race_winner";
export const HORSE_RACE_PLACE_EVENT_TYPE = "horse_race_place";

// ── Lookup tables ───────────────────────────────────────────────────────────

const EVENT_TYPE_LABELS: Record<string, string> = {
  [WINNER_EVENT_TYPE]: "Virtual Football — Winner",
  [OVER_UNDER_EVENT_TYPE]: "Virtual Football — Over/Under",
  [DOG_RACE_WINNER_EVENT_TYPE]: "Virtual Dog Race — Winner",
  [HORSE_RACE_WINNER_EVENT_TYPE]: "Virtual Horse Race — Winner",
  [HORSE_RACE_PLACE_EVENT_TYPE]: "Virtual Horse Race — Place",
};

const OUTCOME_LABELS: Record<string, string[]> = {
  [WINNER_EVENT_TYPE]: ["BLACK FC win", "Draw", "GOLD FC win"],
  [OVER_UNDER_EVENT_TYPE]: ["Under 2.5 goals", "Over 2.5 goals"],
  [DOG_RACE_WINNER_EVENT_TYPE]: ["Shadow", "Blaze", "Rocket", "Storm", "Ghost", "Thunder"],
  [HORSE_RACE_WINNER_EVENT_TYPE]: [
    "Iron Duke",
    "Silver Arrow",
    "Dark Storm",
    "Golden Flash",
    "Night Rider",
    "Desert Wind",
    "Thunder King",
    "Black Pearl",
  ],
  [HORSE_RACE_PLACE_EVENT_TYPE]: ["Does not place", "Places (Top 2)"],
};

/** Human-readable label for a market's eventType string. */
export function eventTypeLabel(eventType: string): string {
  return EVENT_TYPE_LABELS[eventType] ?? eventType;
}

/** Human-readable label for one outcome index within a market. */
export function outcomeLabel(eventType: string, outcomeIndex: number): string {
  const labels = OUTCOME_LABELS[eventType];
  if (labels && labels[outcomeIndex] !== undefined) return labels[outcomeIndex];
  return `Outcome ${outcomeIndex}`;
}

/** All outcome labels for a market, in outcome-index order. */
export function outcomeLabels(eventType: string, outcomeCount: number): string[] {
  const labels = OUTCOME_LABELS[eventType];
  if (labels) return labels;
  return Array.from({ length: outcomeCount }, (_, i) => `Outcome ${i}`);
}
