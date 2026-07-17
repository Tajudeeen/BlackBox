"use client";

import { useParams } from "next/navigation";
import { useCallback } from "react";
import { useAccount, useReadContract } from "wagmi";

import { ClaimPanel } from "@/components/claim-panel";
import { ConfidentialityProof } from "@/components/confidentiality-proof";
import { PredictionForm } from "@/components/prediction-form";
import { BLACKBOX_MARKET_ABI, MARKET_CONTRACT_ADDRESS } from "@/lib/contract";
import { eventTypeLabel, outcomeLabel } from "@/lib/marketMeta";
import { useCountdown } from "@/lib/useCountdown";

// How often to re-check this market's chain state. Covers both the
// open -> closed -> resolved transition and a freshly submitted
// prediction or claim showing up without a manual page refresh.
const POLL_INTERVAL_MS = 5_000;

export default function MarketDetailPage() {
  const params = useParams<{ id: string }>();
  const isValidId = /^\d+$/.test(params.id);
  const marketId = isValidId ? BigInt(params.id) : 0n;
  const { address } = useAccount();

  const { data: market, isLoading } = useReadContract({
    address: MARKET_CONTRACT_ADDRESS,
    abi: BLACKBOX_MARKET_ABI,
    functionName: "getMarket",
    args: [marketId],
    query: {
      enabled: Boolean(MARKET_CONTRACT_ADDRESS) && isValidId,
      refetchInterval: POLL_INTERVAL_MS,
    },
  });

  const { data: odds } = useReadContract({
    address: MARKET_CONTRACT_ADDRESS,
    abi: BLACKBOX_MARKET_ABI,
    functionName: "getMarketOdds",
    args: [marketId],
    query: { enabled: Boolean(MARKET_CONTRACT_ADDRESS) && isValidId },
  });

  const { data: position, refetch: refetchPosition } = useReadContract({
    address: MARKET_CONTRACT_ADDRESS,
    abi: BLACKBOX_MARKET_ABI,
    functionName: "getPosition",
    args: address ? [marketId, address] : undefined,
    query: {
      enabled: Boolean(MARKET_CONTRACT_ADDRESS && address) && isValidId,
      refetchInterval: POLL_INTERVAL_MS,
    },
  });

  const closingTime = market ? Number(market[4]) : 0;
  const countdown = useCountdown(closingTime);
  const resolved = market?.[1] ?? false;
  const isClosed = countdown.isPast;

  const handleSubmitted = useCallback(() => {
    refetchPosition();
  }, [refetchPosition]);

  if (!isValidId) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16 lg:max-w-3xl">
        <p className="text-sm text-bb-text-dim">That market id is not valid.</p>
      </main>
    );
  }

  if (!MARKET_CONTRACT_ADDRESS) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16 lg:max-w-3xl">
        <p className="text-sm text-bb-text-dim">No market contract is configured.</p>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16 lg:max-w-3xl space-y-4">
        <div className="h-4 w-40 animate-pulse rounded bg-bb-black-soft" />
        <div className="h-8 w-80 animate-pulse rounded bg-bb-black-soft" />
        <div className="h-4 w-32 animate-pulse rounded bg-bb-black-soft" />
        <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-md border border-bb-line bg-bb-black-soft" />
          ))}
        </div>
      </main>
    );
  }

  if (!market || !market[0]) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16 lg:max-w-3xl">
        <p className="text-sm text-bb-text-dim">This market does not exist.</p>
      </main>
    );
  }

  const [, , outcomeCount, winningOutcome, , eventType, label] = market;
  const status = resolved ? "Resolved" : isClosed ? "Closed" : "Open";
  const hasSubmitted = position?.[0] ?? false;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16 lg:max-w-3xl">
      <p className="text-xs uppercase tracking-wide text-bb-text-dim">{eventTypeLabel(eventType)}</p>
      <h1 className="mt-1 text-2xl font-medium text-bb-text">{label}</h1>
      <p className="mt-2 text-sm text-bb-text-dim">
        {status} · {resolved ? "Settled" : countdown.label}
      </p>

      {resolved && (
        <p className="mt-2 text-sm text-bb-yellow">
          Result: {outcomeLabel(eventType, winningOutcome)}
        </p>
      )}

      {!resolved && isClosed && (
        <p className="mt-2 text-xs text-bb-text-dim animate-pulse">
          Checking for resolution…
        </p>
      )}

      {odds && (
        <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {odds.map((bps, index) => (
            <div key={index} className="rounded-md border border-bb-line bg-bb-black-soft px-4 py-3">
              <p className="text-sm text-bb-text">{outcomeLabel(eventType, index)}</p>
              <p className="text-xs text-bb-text-dim">{(Number(bps) / 10_000).toFixed(2)}× payout</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 space-y-6">
        {!resolved && !hasSubmitted && !isClosed && (
          <PredictionForm
            marketId={marketId}
            eventType={eventType}
            outcomeCount={outcomeCount}
            onSubmitted={handleSubmitted}
          />
        )}

        {!resolved && hasSubmitted && !isClosed && (
          <div className="rounded-md border border-bb-line bg-bb-black-soft p-5">
            <p className="text-sm font-medium text-bb-text">Prediction submitted</p>
            <p className="mt-1 text-xs text-bb-text-dim">
              Your encrypted prediction is on chain. This page will update automatically when the market resolves.
            </p>
          </div>
        )}

        {!resolved && !hasSubmitted && isClosed && (
          <div className="rounded-md border border-bb-line bg-bb-black-soft p-5">
            <p className="text-sm font-medium text-bb-text">Market closed</p>
            <p className="mt-1 text-xs text-bb-text-dim">
              This market stopped accepting predictions. Check the markets page for open ones.
            </p>
          </div>
        )}

        {!resolved && hasSubmitted && isClosed && (
          <div className="rounded-md border border-bb-line bg-bb-black-soft p-5">
            <p className="text-sm font-medium text-bb-text">Waiting for resolution</p>
            <p className="mt-1 text-xs text-bb-text-dim">
              Your prediction is locked in. This page checks for resolution automatically — no need to refresh.
            </p>
          </div>
        )}

        {resolved && <ClaimPanel marketId={marketId} />}

        {hasSubmitted && <ConfidentialityProof marketId={marketId} />}
      </div>
    </main>
  );
}
