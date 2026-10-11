export const BLACKBOX_MARKET_ABI = [
  'function PROTOCOL_VERSION() view returns (uint256)',
  'function operator() view returns (address)',
  'function marketByKey(bytes32) view returns (uint256)',
  'function createMarket(string eventType, string label, uint64 closingTime, uint32[] odds, bytes32 commitment, bytes32 creationKey) returns (uint256)',
  'function resolveMarket(uint256 marketId, bytes32 seed)',
  'function cancelExpired(uint256 marketId)',
  'function getMarket(uint256 marketId) view returns (bool exists, bool resolved, uint8 outcomeCount, uint8 winningOutcome, uint64 closingTime, string eventType, string label)',
  'function getMarketOdds(uint256 marketId) view returns (uint32[])',
  'function getMarketEvidence(uint256 marketId) view returns (bytes32 commitment, bytes32 seed, bool cancelled, uint256 version)',
  'event MarketCreated(uint256 indexed marketId, string eventType, string label, uint64 indexed closingTime, uint8 indexed outcomeCount)',
];
