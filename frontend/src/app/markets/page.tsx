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
          anyone else predicted, how much they put in, or how the market is leaning.
        </p>
      </div>

      <div className="mt-8 space-y-3">
        {!MARKET_CONTRACT_ADDRESS && (
          <div className="rounded-md border border-bb-line bg-bb-black-soft p-6 text-center">
            <p className="text-sm font-medium text-bb-text">Contract not configured</p>
            <p className="mt-1 text-xs text-bb-text-dim">
              Set <code className="font-mono">NEXT_PUBLIC_MARKET_CONTRACT_ADDRESS</code> in your environment
              variables to a deployed BlackboxMarket address.
            </p>
          </div>
        )}

        {MARKET_CONTRACT_ADDRESS && isLoading && (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-md border border-bb-line bg-bb-black-soft" />
            ))}
          </div>
        )}

        {MARKET_CONTRACT_ADDRESS && !isLoading && markets.length === 0 && (
          <div className="rounded-md border border-bb-line bg-bb-black-soft p-6 text-center">
            <p className="text-sm font-medium text-bb-text">No markets open yet</p>
            <p className="mt-1 text-xs text-bb-text-dim">
              The simulation engine creates markets automatically. Check back in a moment.
            </p>
          </div>
        )}

        {markets.map((market) => (
          <MarketCard key={market.marketId.toString()} market={market} />
        ))}
      </div>
    </main>
  );
}
