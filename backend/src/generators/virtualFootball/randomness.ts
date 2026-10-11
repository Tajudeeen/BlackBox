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



/** Maps one derived word onto a uniform float in [0, 1). */
export function nextUniform(seedHex: string, index: number): number {
  return Number(deriveWord(seedHex, index) >> 203n) / 2 ** 53;
}
