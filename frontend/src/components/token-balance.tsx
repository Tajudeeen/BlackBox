"use client";

import { useAccount } from "wagmi";

import { useFaucet, useTokenBalance } from "@/lib/useToken";

export function TokenBalance() {
  const { isConnected } = useAccount();
  const { hasBalance, formattedBalance, isDecryptAllowed, authorizeDecrypt, isAuthorizingDecrypt, isDecrypting } =
    useTokenBalance();
  const { claim, isPending: isClaimingFaucet, error: faucetError, formattedFaucetAmount } = useFaucet();

  if (!isConnected) return null;

  return (
    <div className="flex items-center gap-2 rounded-md border border-bb-line bg-bb-black-soft px-3 py-1.5">
      <span className="text-xs text-bb-text-dim">BBX</span>

      {!hasBalance && <span className="text-xs text-bb-text-dim">0</span>}

      {hasBalance && !isDecryptAllowed && (
        <button
          type="button"
          onClick={authorizeDecrypt}
          disabled={isAuthorizingDecrypt}
          className="text-xs font-medium text-bb-yellow underline-offset-4 hover:underline disabled:opacity-50"
        >
          {isAuthorizingDecrypt ? "Signing…" : "Show balance"}
        </button>
      )}

      {hasBalance && isDecryptAllowed && (
        <span className="text-xs font-medium text-bb-text">
          {isDecrypting ? "…" : (formattedBalance ?? "…")}
        </span>
      )}

      <button
        type="button"
        onClick={() => claim()}
        disabled={isClaimingFaucet}
        title={formattedFaucetAmount ? `Get ${formattedFaucetAmount} free testnet BBX` : "Get free testnet BBX"}
        className="ml-1 rounded border border-bb-line px-2 py-0.5 text-xs text-bb-text-dim transition-colors hover:border-bb-yellow-dim hover:text-bb-text disabled:opacity-50"
      >
        {isClaimingFaucet ? "…" : "+ Faucet"}
      </button>

      {faucetError && (
        <span className="text-xs text-red-400" title={faucetError.message}>
          !
        </span>
      )}
    </div>
  );
}
