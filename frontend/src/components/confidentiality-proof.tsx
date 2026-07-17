"use client";

import { useAccount, useReadContract } from "wagmi";

import { BLACKBOX_MARKET_ABI, MARKET_CONTRACT_ADDRESS } from "@/lib/contract";

/**
 * Shows the connected wallet's own raw on-chain ciphertext handles for a
 * market position -- not a claim that confidentiality works, but the
 * actual bytes32 values anyone (including the person looking at this
 * panel) can read directly off the chain, so a skeptical viewer can see
 * for themselves that nothing readable is stored.
 *
 * These handles are not secret in themselves -- anyone who calls
 * getPosition for any address gets the same bytes32 values back. What
 * stays private is the ability to decrypt them into a number: only the
 * FHEVM's access control list, set inside BlackboxMarket.submitPrediction
 * and .claim (see that contract's `FHE.allow` calls), decides who can
 * turn a given handle into cleartext. This panel's point is narrower and
 * more concrete than a general confidentiality claim: it shows that the
 * only thing this contract ever wrote to describe a prediction is this
 * meaningless-looking reference, never the outcome or amount itself.
 */
export function ConfidentialityProof({ marketId }: { marketId: bigint }) {
  const { address } = useAccount();

  const { data: position } = useReadContract({
    address: MARKET_CONTRACT_ADDRESS,
    abi: BLACKBOX_MARKET_ABI,
    functionName: "getPosition",
    args: address ? [marketId, address] : undefined,
    query: { enabled: Boolean(MARKET_CONTRACT_ADDRESS && address) },
  });

  if (!position || !position[0]) return null;

  const [, , predictedOutcomeHandle, amountHandle, outcomeShareHandle] = position;

  return (
    <details className="rounded-md border border-bb-line bg-bb-black-soft p-4 text-xs">
      <summary className="cursor-pointer select-none font-medium uppercase tracking-wide text-bb-text-dim">
        See the raw on-chain data for your position
      </summary>
      <p className="mt-3 text-bb-text-dim">
        This is exactly what <code className="font-mono">getPosition</code> returns for your address on this
        market — the real bytes32 values, read live from the chain. There is no plaintext prediction or amount
        stored anywhere for this contract to leak.
      </p>
      <div className="mt-3 space-y-2 font-mono">
        <div>
          <p className="text-bb-text-dim">your predicted outcome (ciphertext handle)</p>
          <p className="break-all text-bb-text">{predictedOutcomeHandle}</p>
        </div>
        <div>
          <p className="text-bb-text-dim">your prediction amount (ciphertext handle)</p>
          <p className="break-all text-bb-text">{amountHandle}</p>
        </div>
        <div>
          <p className="text-bb-text-dim">your outcome share (ciphertext handle)</p>
          <p className="break-all text-bb-text">{outcomeShareHandle}</p>
        </div>
      </div>
      <p className="mt-3 text-bb-text-dim">
        Anyone can read these same bytes for any address on this market — they decode to nothing without
        FHEVM decryption rights, which this contract only ever grants back to the address that submitted them.
      </p>
    </details>
  );
}
