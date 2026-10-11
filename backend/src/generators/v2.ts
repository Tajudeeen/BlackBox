import { keccak256 } from 'ethers';
import { simulateV2 } from '../generated/protocol.mjs';
export function simulateMarkets(eventTypes: string[], seed: string) {
  const outcomes = eventTypes.map(type => simulateV2(type, seed, keccak256));
  return { outcomes, summary: `Protocol v2 outcomes: ${outcomes.join(', ')}` };
}
