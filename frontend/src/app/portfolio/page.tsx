"use client";

import Link from "next/link";
import { useAccount, useReadContract, useReadContracts } from "wagmi";

import { BLACKBOX_MARKET_ABI, MARKET_CONTRACT_ADDRESS } from "@/lib/contract";
import { eventTypeIcon, eventTypeLabel, outcomeLabel } from "@/lib/marketMeta";
import { useCountdown } from "@/lib/useCountdown";

type PositionEntry = {
  marketId: bigint;
  label: string;
  eventType: string;
  closingTime: number;
  resolved: boolean;
  winningOutcome: number;
  submitted: boolean;
  claimed: boolean;
};

function PositionRow({ entry }: { entry: PositionEntry }) {
  const countdown = useCountdown(entry.closingTime);

  const statusLabel = entry.resolved
    ? "Resolved"
    : countdown.isPast
      ? "Closed"
      : "Open";

  const statusColor = entry.resolved
    ? "text-bb-purple"
    : countdown.isPast
      ? "text-bb-text-dim"
      : "text-bb-yellow";

  const actionLabel = entry.resolved && !entry.claimed
    ? "Claim"
    : entry.resolved && entry.claimed
      ? "Claimed"
      : countdown.isPast
        ? "Awaiting resolution"
        : "Open";

  const actionColor = entry.resolved && !entry.claimed
    ? "text-bb-yellow font-medium"
    : "text-bb-text-dim";

  return (
    <Link
      href={`/markets/${entry.marketId}`}
      className="flex flex-col gap-2 rounded-md border border-bb-line bg-bb-black-soft px-4 py-3 transition-colors hover:border-bb-yellow-dim sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-5 sm:py-4"
    >
      <div className="flex items-start gap-3 min-w-0">
        <span className="mt-0.5 text-lg shrink-0">{eventTypeIcon(entry.eventType)}</span>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-bb-text-dim truncate">
            {eventTypeLabel(entry.eventType)}
          </p>
          <p className="mt-0.5 text-sm font-medium text-bb-text truncate">{entry.label}</p>
          {entry.resolved && (
            <p className="mt-0.5 text-xs text-bb-text-dim">
              Result: {outcomeLabel(entry.eventType, entry.winningOutcome)}
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 pl-9 sm:block sm:space-y-1 sm:pl-0 sm:text-right">
        <p className={`text-xs font-medium uppercase tracking-wide ${statusColor}`}>
          {statusLabel}
        </p>
        <p className={`text-xs ${actionColor}`}>{actionLabel}</p>
      </div>
    </Link>
  );
}

function PortfolioContent({ address }: { address: string }) {
  const { data: nextMarketId, isLoading: isLoadingCount } = useReadContract({
    address: MARKET_CONTRACT_ADDRESS,
    abi: BLACKBOX_MARKET_ABI,
    functionName: "nextMarketId",
    query: { enabled: Boolean(MARKET_CONTRACT_ADDRESS) },
  });

  const count = nextMarketId ?? 0n;
  const marketIds = Array.from({ length: Number(count) }, (_, i) => BigInt(i));

  const { data: marketData, isLoading: isLoadingMarkets } = useReadContracts({
    contracts: marketIds.map((marketId) => ({
      address: MARKET_CONTRACT_ADDRESS,
      abi: BLACKBOX_MARKET_ABI,
      functionName: "getMarket" as const,
      args: [marketId] as const,
    })),
    query: { enabled: Boolean(MARKET_CONTRACT_ADDRESS) && marketIds.length > 0 },
  });

  const { data: positionData, isLoading: isLoadingPositions } = useReadContracts({
    contracts: marketIds.map((marketId) => ({
      address: MARKET_CONTRACT_ADDRESS,
      abi: BLACKBOX_MARKET_ABI,
      functionName: "getPosition" as const,
      args: [marketId, address as `0x${string}`] as const,
    })),
    query: { enabled: Boolean(MARKET_CONTRACT_ADDRESS) && marketIds.length > 0 },
  });

  const isLoading = isLoadingCount || isLoadingMarkets || isLoadingPositions;

  if (isLoading) {
    return (
      <div className="space-y-3 mt-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-md border border-bb-line bg-bb-black-soft" />
        ))}
      </div>
    );
  }

  const positions = marketIds
    .map((marketId, i): PositionEntry | null => {
      const market = marketData?.[i];
      const position = positionData?.[i];
      if (market?.status !== "success" || position?.status !== "success") return null;

      const [exists, resolved, , winningOutcome, closingTime, eventType, label] = market.result as [
        boolean, boolean, number, number, bigint, string, string,
      ];
      const [submitted, claimed] = position.result as [boolean, boolean, ...unknown[]];

      if (!exists || !submitted) return null;

      return {
        marketId,
        label,
        eventType,
        closingTime: Number(closingTime),
        resolved,
        winningOutcome,
        submitted,
        claimed,
      };
    })
    .filter((p): p is PositionEntry => p !== null)
    .reverse();

  const unclaimed = positions.filter((p) => p.resolved && !p.claimed);
  const pending = positions.filter((p) => !p.resolved);
  const history = positions.filter((p) => p.resolved && p.claimed);

  if (positions.length === 0) {
    return (
      <div className="mt-8 rounded-md border border-bb-line bg-bb-black-soft p-8 text-center">
        <p className="text-sm font-medium text-bb-text">No positions yet</p>
        <p className="mt-1 text-xs text-bb-text-dim">
          Submit a prediction on any open market to see your activity here.
        </p>
        <Link
          href="/markets"
          className="mt-4 inline-block rounded-md bg-bb-yellow px-4 py-2 text-sm font-medium text-bb-black"
        >
          Browse markets
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-8">
      {unclaimed.length > 0 && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-wide text-bb-yellow mb-3">
            Ready to claim ({unclaimed.length})
          </h2>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {unclaimed.map((p) => (
              <PositionRow key={p.marketId.toString()} entry={p} />
            ))}
          </div>
        </section>
      )}

      {pending.length > 0 && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-wide text-bb-text-dim mb-3">
            Active positions ({pending.length})
          </h2>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {pending.map((p) => (
              <PositionRow key={p.marketId.toString()} entry={p} />
            ))}
          </div>
        </section>
      )}

      {history.length > 0 && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-wide text-bb-text-dim mb-3">
            History ({history.length})
          </h2>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {history.map((p) => (
              <PositionRow key={p.marketId.toString()} entry={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16 lg:max-w-5xl xl:max-w-6xl">
      <div className="space-y-1">
        <h1 className="text-2xl font-medium text-bb-text">Portfolio</h1>
        <p className="text-sm text-bb-text-dim">
          Every market you have submitted a prediction to. Only you can see this — your predictions
          and amounts are encrypted on chain.
        </p>
      </div>

      {!isConnected && (
        <div className="mt-8 rounded-md border border-bb-line bg-bb-black-soft p-8 text-center">
          <p className="text-sm font-medium text-bb-text">Connect your wallet</p>
          <p className="mt-1 text-xs text-bb-text-dim">
            Your portfolio is tied to your wallet address. Connect to see your positions.
          </p>
        </div>
      )}

      {isConnected && address && !MARKET_CONTRACT_ADDRESS && (
        <div className="mt-8 rounded-md border border-bb-line bg-bb-black-soft p-6 text-center">
          <p className="text-sm text-bb-text-dim">Contract not configured.</p>
        </div>
      )}

      {isConnected && address && MARKET_CONTRACT_ADDRESS && (
        <PortfolioContent address={address} />
      )}
    </main>
  );
}
