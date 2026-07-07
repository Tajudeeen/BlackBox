"use client";

import Link from "next/link";

import type { MarketSummary } from "@/lib/useMarkets";
import { useCountdown } from "@/lib/useCountdown";
import { eventTypeLabel } from "@/lib/marketMeta";

export function MarketCard({ market }: { market: MarketSummary }) {
  const countdown = useCountdown(market.closingTime);

  const status = market.resolved ? "Resolved" : countdown.isPast ? "Closed" : "Open";
  const statusColor =
    status === "Open" ? "text-bb-yellow" : status === "Closed" ? "text-bb-text-dim" : "text-bb-purple";

  return (
    <Link
      href={`/markets/${market.marketId}`}
      className="block rounded-md border border-bb-line bg-bb-black-soft p-5 transition-colors hover:border-bb-yellow-dim"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-bb-text-dim">{eventTypeLabel(market.eventType)}</p>
          <h3 className="mt-1 text-base font-medium text-bb-text">{market.label}</h3>
        </div>
        <span className={`shrink-0 text-xs font-medium uppercase tracking-wide ${statusColor}`}>{status}</span>
      </div>
      <p className="mt-3 text-sm text-bb-text-dim">{market.resolved ? "Settled" : countdown.label}</p>
    </Link>
  );
}
