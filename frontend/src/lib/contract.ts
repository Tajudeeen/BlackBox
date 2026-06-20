/**
 * BlackboxMarket contract address and ABI, hand-maintained to match
 * contracts/contracts/BlackboxMarket.sol. The contracts package and the
 * frontend package have independent dependency trees (see the root
 * README), so this avoids coupling the frontend's install to the
 * contracts package's build output. Keep this in sync if the contract's
 * public interface changes.
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
