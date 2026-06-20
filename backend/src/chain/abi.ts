/**
 * Minimal human-readable ABI for BlackboxMarket. Hand-maintained rather
 * than imported from the contracts package: the two packages have
 * independent dependency trees (see the root README), so this is the
 * simplest way to avoid coupling the backend's install to the contracts
 * package's build output. Keep this in sync with
 * contracts/contracts/BlackboxMarket.sol if its public interface changes.
 */
export const BLACKBOX_MARKET_ABI = [
  "function createMarket(string eventType, string label, uint64 closingTime, uint32[] outcomeOddsBps) returns (uint256 marketId)",
  "function resolveMarket(uint256 marketId, uint8 winningOutcome)",
  "function getMarket(uint256 marketId) view returns (bool exists, bool resolved, uint8 outcomeCount, uint8 winningOutcome, uint64 closingTime, string eventType, string label)",
  "event MarketCreated(uint256 indexed marketId, string eventType, string label, uint64 indexed closingTime, uint8 indexed outcomeCount)",
  "event MarketResolved(uint256 indexed marketId, uint8 indexed winningOutcome)",
];
