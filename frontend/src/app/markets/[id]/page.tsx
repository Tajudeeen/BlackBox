"use client";

import { useParams } from "next/navigation";
import { useCallback } from "react";
import { useAccount, useReadContract } from "wagmi";

import { ClaimPanel } from "@/components/claim-panel";
import { PredictionForm } from "@/components/prediction-form";
import { BLACKBOX_MARKET_ABI, MARKET_CONTRACT_ADDRESS } from "@/lib/contract";
import { outcomeLabel } from "@/lib/marketMeta";
import { useCountdown } from "@/lib/useCountdown";

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
    query: { enabled: Boolean(MARKET_CONTRACT_ADDRESS) && isValidId },
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
    query: { enabled: Boolean(MARKET_CONTRACT_ADDRESS && address) && isValidId },
  });

  const closingTime = market ? Number(market[4]) : 0;
  const countdown = useCountdown(closingTime);
  const handleSubmitted = useCallback(() => {
    refetchPosition();
  }, [refetchPosition]);

  if (!isValidId) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm text-bb-text-dim">Not a valid market id.</p>
      </main>
    );
  }

  if (!MARKET_CONTRACT_ADDRESS) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm text-bb-text-dim">No market contract is configured.</p>
      </main>
    );
  }

  if (isLoading || !market) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm text-bb-text-dim">Loading market…</p>
      </main>
    );
  }

  const [exists, resolved, outcomeCount, winningOutcome, , eventType, label] = market;

  if (!exists) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm text-bb-text-dim">This market does not exist.</p>
      </main>
    );
  }

  const status = resolved ? "Resolved" : countdown.isPast ? "Closed" : "Open";
  const hasSubmitted = position?.[0] ?? false;

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-xs uppercase tracking-wide text-bb-text-dim">{eventType}</p>
      <h1 className="mt-1 text-2xl font-medium text-bb-text">{label}</h1>
      <p className="mt-2 text-sm text-bb-text-dim">
        {status} · {resolved ? "Settled" : countdown.label}
      </p>

      {resolved && <p className="mt-2 text-sm text-bb-yellow">Result: {outcomeLabel(eventType, winningOutcome)}</p>}

      {odds && (
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {odds.map((bps, index) => (
            <div key={index} className="rounded-md border border-bb-line bg-bb-black-soft px-4 py-3">
              <p className="text-sm text-bb-text">{outcomeLabel(eventType, index)}</p>
              <p className="text-xs text-bb-text-dim">{(bps / 10_000).toFixed(2)}x payout</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 space-y-6">
        {!resolved && !hasSubmitted && !countdown.isPast && (
          <PredictionForm
            marketId={marketId}
            eventType={eventType}
            outcomeCount={outcomeCount}
            onSubmitted={handleSubmitted}
          />
        )}

        {!resolved && hasSubmitted && (
          <p className="text-sm text-bb-text-dim">
            Your prediction is in. Come back once this market resolves to claim privately.
          </p>
        )}

        {!resolved && !hasSubmitted && countdown.isPast && (
          <p className="text-sm text-bb-text-dim">This market closed without a prediction from you.</p>
        )}

        {resolved && <ClaimPanel marketId={marketId} />}
      </div>
    </main>
  );
}
