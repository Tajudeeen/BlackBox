/**
 * BlackboxMarket and BlackboxCoin contract addresses and ABIs,
 * hand-maintained to match contracts/contracts/BlackboxMarket.sol and
 * contracts/contracts/BlackboxCoin.sol. The contracts package and the
 * frontend package have independent dependency trees (see the root
 * README), so this avoids coupling the frontend's install to the
 * contracts package's build output. Keep this in sync if either
 * contract's public interface changes -- every shape here was checked
 * against the real compiled artifact, not hand-guessed.
 */
export const MARKET_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_MARKET_CONTRACT_ADDRESS as
  | `0x${string}`
  | undefined;

export const BLACKBOX_MARKET_ABI = [
  {
    type: "function",
    name: "nextMarketId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "TOKEN",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "getMarket",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [
      { name: "exists", type: "bool" },
      { name: "resolved", type: "bool" },
      { name: "outcomeCount", type: "uint8" },
      { name: "winningOutcome", type: "uint8" },
      { name: "closingTime", type: "uint64" },
      { name: "eventType", type: "string" },
      { name: "label", type: "string" },
    ],
  },
  {
    type: "function",
    name: "getMarketOdds",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [{ name: "", type: "uint32[]" }],
  },
  {
    type: "function",
    name: "getPosition",
    stateMutability: "view",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "participant", type: "address" },
    ],
    outputs: [
      { name: "submitted", type: "bool" },
      { name: "claimed", type: "bool" },
      { name: "predictedOutcome", type: "bytes32" },
      { name: "amount", type: "bytes32" },
      { name: "outcomeShare", type: "bytes32" },
    ],
  },
  {
    type: "function",
    name: "submitPrediction",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "encryptedOutcome", type: "bytes32" },
      { name: "encryptedAmount", type: "bytes32" },
      { name: "inputProof", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [],
  },
] as const;

/**
 * BlackboxCoin's address is read from the deployed BlackboxMarket's own
 * TOKEN() getter (see useTokenAddress in lib/useToken.ts) rather than a
 * second environment variable -- this removes an entire class of
 * misconfiguration where the two addresses could drift out of sync.
 */
export const BLACKBOX_COIN_ABI = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "confidentialBalanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "isOperator",
    stateMutability: "view",
    inputs: [
      { name: "holder", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "setOperator",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "until", type: "uint48" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "faucet",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "FAUCET_AMOUNT",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint64" }],
  },
  {
    type: "function",
    name: "FAUCET_COOLDOWN",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "nextFaucetClaim",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "nextClaimTime", type: "uint256" }],
  },
] as const;
