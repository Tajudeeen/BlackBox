/**
 * Commit-reveal randomness for the virtual football generator.
 *
 * The randomness model, in plain terms:
 *
 * 1. Before a fixture's markets are created, the engine generates a 32-byte
 *    secret seed and publishes only its keccak256 commitment alongside the
 *    markets (see fixtures/runFixture.ts). The seed itself is kept private
 *    by the engine until settlement.
 * 2. After the markets close, the engine reveals the seed, recomputes the
 *    match outcome from it (see simulate.ts), and submits that outcome on
 *    chain. The reveal and the outcome summary are written to the public
 *    `simulation_events` table.
 * 3. Anyone can then verify the engine did not change its mind after seeing
 *    participants' positions: hash the revealed seed yourself and check it
 *    matches the commitment that was published before the market closed,
 *    then re-run `simulateMatch` on the revealed seed yourself and check it
 *    produces the same outcome that was submitted on chain.
 *
 * This does not require trusting the engine operator's honesty -- it only
 * requires that the commitment was published before the market closed,
 * which is true because market creation and commitment publication happen
 * in the same step (see fixtures/runFixture.ts). A dishonest operator who
 * tried to pick a different seed after seeing positions would produce a
 * revealed seed that does not hash to the already-published commitment,
 * which is publicly checkable by anyone with the seed and this file.
 *
 * What this does NOT protect against: the engine choosing not to publish a
 * fixture it doesn't like the look of before committing (selective
 * disclosure before commitment), and the engine being the only party who
 * sees the seed before reveal (front-running by the operator itself, not
 * by other participants). Removing those would need a verifiable random
 * function or a multi-party reveal, which is a reasonable Phase 5 upgrade,
 * not a Phase 3 one.
 */
import { randomBytes } from "node:crypto";

import { keccak256 } from "ethers";

/** Generates a fresh 32-byte secret seed as a 0x-prefixed hex string. */
export function generateSeed(): string {
  return `0x${randomBytes(32).toString("hex")}`;
}

/** Computes the public commitment for a seed. Safe to publish immediately. */
export function commitSeed(seedHex: string): string {
  return keccak256(seedHex);
}

/** Checks that a revealed seed matches a previously published commitment. */
export function verifyReveal(seedHex: string, commitment: string): boolean {
  return commitSeed(seedHex) === commitment;
}

/**
 * Deterministically expands a seed into an unbounded stream of pseudorandom
 * 256-bit words, in the spirit of how verifiable randomness is often
 * expanded into multiple random values from one source: word `i` is
 * `keccak256(seed || i)`. Anyone with the seed can recompute the exact same
 * stream, which is what makes the simulation independently verifiable.
 */
export function deriveWord(seedHex: string, index: number): bigint {
  const indexHex = index.toString(16).padStart(8, "0");
  return BigInt(keccak256(`${seedHex}${indexHex}`));
}

const TWO_TO_256 = 2 ** 256;

/** Maps one derived word onto a uniform float in [0, 1). */
export function nextUniform(seedHex: string, index: number): number {
  return Number(deriveWord(seedHex, index)) / TWO_TO_256;
}
