"use client";

import { useReadContract, useReadContracts } from "wagmi";

import { BLACKBOX_MARKET_ABI, MARKET_CONTRACT_ADDRESS } from "@/lib/contract";

export type MarketSummary = {
  marketId: bigint;
  exists: boolean;
  resolved: boolean;
  outcomeCount: number;
  winningOutcome: number;
  closingTime: number;
  eventType: string;
  label: string;
};

// How often to re-check the chain for new or updated markets. Without
// this, a page that stays open and focused (exactly what a judge
// evaluating a live demo does) never sees new markets appear on its own
// -- wagmi/tanstack-query only refetches on mount or window refocus by
// default, not on a timer. 5s keeps the UI feeling live without hammering
// the RPC provider.
const POLL_INTERVAL_MS = 5_000;

/**
 * Reads every market from the contract: `nextMarketId` first, then one
 * `getMarket` call per id via multicall. Fine at hackathon scale (a
 * handful of fixtures at a time, per the Phase 3 backend's one-fixture-
 * in-flight design); a market count in the thousands would want an
 * indexer instead of multicalling every id on each page load.
 */
export function useMarkets() {
  const { data: nextMarketId, isLoading: isLoadingCount } = useReadContract({
    address: MARKET_CONTRACT_ADDRESS,
    abi: BLACKBOX_MARKET_ABI,
    functionName: "nextMarketId",
    query: {
      enabled: Boolean(MARKET_CONTRACT_ADDRESS),
      refetchInterval: POLL_INTERVAL_MS,
    },
  });

  const count = nextMarketId ?? 0n;
  const marketIds = Array.from({ length: Number(count) }, (_, i) => BigInt(i));

  const { data, isLoading: isLoadingMarkets } = useReadContracts({
    contracts: marketIds.map(
      (marketId) =>
        ({
          address: MARKET_CONTRACT_ADDRESS,
          abi: BLACKBOX_MARKET_ABI,
          functionName: "getMarket",
          args: [marketId],
        }) as const,
    ),
    query: {
      enabled: Boolean(MARKET_CONTRACT_ADDRESS) && marketIds.length > 0,
      refetchInterval: POLL_INTERVAL_MS,
    },
  });

  const markets: MarketSummary[] = marketIds
    .map((marketId, i) => {
      const result = data?.[i];
      if (!result || result.status !== "success") return null;
      const [exists, resolved, outcomeCount, winningOutcome, closingTime, eventType, label] = result.result as [
        boolean,
        boolean,
        number,
        number,
        bigint,
        string,
        string,
      ];
      return {
        marketId,
        exists,
        resolved,
        outcomeCount,
        winningOutcome,
        closingTime: Number(closingTime),
        eventType,
        label,
      };
    })
    .filter((m): m is MarketSummary => m !== null && m.exists)
    .reverse(); // newest first

  return { markets, isLoading: isLoadingCount || isLoadingMarkets };
}
