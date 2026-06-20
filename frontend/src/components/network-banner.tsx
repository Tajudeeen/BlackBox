"use client";

import { sepolia } from "wagmi/chains";
import { useAccount, useChainId, useSwitchChain } from "wagmi";

/**
 * BLACKBOX's deployed contract and the Zama relayer transport configured
 * for it (see lib/zama-provider.tsx) only exist on Sepolia. Found during
 * the Phase 5 review: the wagmi config also lists the local Hardhat chain
 * as connectable, for local contract development, so RainbowKit's own
 * built-in "wrong network" detection does not fire when a wallet is
 * connected to Hardhat -- from wagmi's point of view that is a supported
 * chain, not a wrong one. Without this banner, a wallet connected to the
 * wrong (but "supported") chain would just see market reads silently
 * fail or return nothing, with no indication why.
 */
export function NetworkBanner() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  if (!isConnected || chainId === sepolia.id) return null;

  return (
    <div className="border-b border-bb-yellow-dim bg-bb-black-soft px-6 py-3 text-center text-sm text-bb-text">
      Your wallet is on the wrong network. BLACKBOX runs on Sepolia.{" "}
      <button
        type="button"
        onClick={() => switchChain({ chainId: sepolia.id })}
        disabled={isPending}
        className="font-medium text-bb-yellow underline-offset-4 hover:underline disabled:opacity-50"
      >
        {isPending ? "Switching…" : "Switch to Sepolia"}
      </button>
    </div>
  );
}
