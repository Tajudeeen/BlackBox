"use client";

import { useState } from "react";

import { MarketCard } from "@/components/market-card";
import { MARKET_CONTRACT_ADDRESS } from "@/lib/contract";
import {
  DOG_RACE_WINNER_EVENT_TYPE,
  HORSE_RACE_PLACE_EVENT_TYPE,
  HORSE_RACE_WINNER_EVENT_TYPE,
  OVER_UNDER_EVENT_TYPE,
  WINNER_EVENT_TYPE,
} from "@/lib/marketMeta";
import { useMarkets } from "@/lib/useMarkets";

const TABS = [
  {
    id: "football",
    label: "Football",
    icon: "⚽",
    eventTypes: [WINNER_EVENT_TYPE, OVER_UNDER_EVENT_TYPE],
  },
  {
    id: "dograce",
    label: "Dog Race",
    icon: "🐕",
    eventTypes: [DOG_RACE_WINNER_EVENT_TYPE],
  },
  {
    id: "horserace",
    label: "Horse Race",
    icon: "🏇",
    eventTypes: [HORSE_RACE_WINNER_EVENT_TYPE, HORSE_RACE_PLACE_EVENT_TYPE],
  },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function MarketsPage() {
  const { markets, isLoading } = useMarkets();
  const [activeTab, setActiveTab] = useState<TabId>("football");

  const currentTab = TABS.find((t) => t.id === activeTab)!;
  const filtered = markets.filter((m) =>
    (currentTab.eventTypes as readonly string[]).includes(m.eventType),
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="space-y-2">
        <h1 className="text-2xl font-medium text-bb-text">Markets</h1>
        <p className="text-sm text-bb-text-dim">
          Every prediction is encrypted. You can see what a market is about and when it closes — never
          what anyone else predicted, how much they put in, or how the market is leaning.
        </p>
      </div>

      {/* Tabs */}
      <div className="mt-8 flex gap-1 rounded-md border border-bb-line bg-bb-black-soft p-1">
        {TABS.map((tab) => {
          const count = markets.filter((m) =>
            (tab.eventTypes as readonly string[]).includes(m.eventType),
          ).length;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-bb-black text-bb-text"
                  : "text-bb-text-dim hover:text-bb-text"
              }`}
            >
              <span>{tab.icon}</span>
              <span className="font-medium">{tab.label}</span>
              {!isLoading && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-xs ${
                    isActive ? "bg-bb-yellow text-bb-black" : "bg-bb-line text-bb-text-dim"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="mt-4 space-y-3">
        {!MARKET_CONTRACT_ADDRESS && (
          <div className="rounded-md border border-bb-line bg-bb-black-soft p-6 text-center">
            <p className="text-sm font-medium text-bb-text">Contract not configured</p>
            <p className="mt-1 text-xs text-bb-text-dim">
              Set{" "}
              <code className="font-mono">NEXT_PUBLIC_MARKET_CONTRACT_ADDRESS</code> to a deployed
              BlackboxMarket address.
            </p>
          </div>
        )}

        {MARKET_CONTRACT_ADDRESS && isLoading && (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-md border border-bb-line bg-bb-black-soft"
              />
            ))}
          </div>
        )}

        {MARKET_CONTRACT_ADDRESS && !isLoading && filtered.length === 0 && (
          <div className="rounded-md border border-bb-line bg-bb-black-soft p-6 text-center">
            <p className="text-lg">{currentTab.icon}</p>
            <p className="mt-2 text-sm font-medium text-bb-text">
              No {currentTab.label} markets yet
            </p>
            <p className="mt-1 text-xs text-bb-text-dim">
              The engine creates new {currentTab.label.toLowerCase()} markets automatically as part of
              the rotation. Check back shortly.
            </p>
          </div>
        )}

        {filtered.map((market) => (
          <MarketCard key={market.marketId.toString()} market={market} />
        ))}
      </div>
    </main>
  );
}
