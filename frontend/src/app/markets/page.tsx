"use client";

import { MarketCard } from "@/components/market-card";
import { MARKET_CONTRACT_ADDRESS } from "@/lib/contract";
import { useMarkets } from "@/lib/useMarkets";

export default function MarketsPage() {
  const { markets, isLoading } = useMarkets();

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="space-y-2">
        <h1 className="text-2xl font-medium text-bb-text">Markets</h1>
        <p className="text-sm text-bb-text-dim">
          Every prediction here is encrypted. You can see what a market is about and when it closes — never what
          anyone else predicted, how much they committed, or how the market is leaning.
        </p>
      </div>

      <div className="mt-8 space-y-3">
        {!MARKET_CONTRACT_ADDRESS && (
          <p className="text-sm text-bb-text-dim">
            No market contract is configured. Set <code>NEXT_PUBLIC_MARKET_CONTRACT_ADDRESS</code> in{" "}
            <code>.env.local</code> to a deployed BlackboxMarket address.
          </p>
        )}
        {MARKET_CONTRACT_ADDRESS && isLoading && <p className="text-sm text-bb-text-dim">Loading markets…</p>}
        {MARKET_CONTRACT_ADDRESS && !isLoading && markets.length === 0 && (
          <p className="text-sm text-bb-text-dim">No markets yet. The simulation engine creates one automatically.</p>
        )}
        {markets.map((market) => (
          <MarketCard key={market.marketId.toString()} market={market} />
        ))}
      </div>
    </main>
  );
}
