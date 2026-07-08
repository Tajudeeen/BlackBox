import type { Generator } from "./types.js";
import { dogRace } from "./dogRace/index.js";
import { horseRace } from "./horseRace/index.js";
import { virtualFootball } from "./virtualFootball/index.js";

/**
 * All active generators, in the order they will rotate.
 * The engine picks the next one on each fixture creation.
 * Add new generators here and they automatically join the rotation.
 */
export const GENERATORS: Generator[] = [virtualFootball, dogRace, horseRace];

/**
 * Returns the generator at position (fixtureCount % GENERATORS.length),
 * so the rotation is: football, dog race, horse race, football, dog race...
 * Pass the total number of fixtures created so far (from the DB or a counter).
 */
export function pickGenerator(fixtureCount: number): Generator {
  return GENERATORS[fixtureCount % GENERATORS.length];
}

/** Look up a generator by name. Used during settlement. */
export function getGenerator(name: string): Generator {
  const gen = GENERATORS.find((g) => g.name === name);
  if (!gen) throw new Error(`Unknown generator: "${name}"`);
  return gen;
}
