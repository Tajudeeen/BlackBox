"use client";

import { isZeroHandle, useAllow, useIsAllowed, useUserDecrypt } from "@zama-fhe/react-sdk";
import { useEffect } from "react";
import { formatUnits } from "viem";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { BLACKBOX_MARKET_ABI, MARKET_CONTRACT_ADDRESS } from "@/lib/contract";
import { useTokenDecimals } from "@/lib/useToken";

export function ClaimPanel({ marketId }: { marketId: bigint }) {
  const { address } = useAccount();
  const decimals = useTokenDecimals();

  const { data: position, refetch: refetchPosition } = useReadContract({
    address: MARKET_CONTRACT_ADDRESS,
    abi: BLACKBOX_MARKET_ABI,
    functionName: "getPosition",
    args: address ? [marketId, address] : undefined,
    query: { enabled: Boolean(MARKET_CONTRACT_ADDRESS && address) },
  });

  const { writeContractAsync, data: txHash, isPending: isWriting, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  const { mutate: allow, isPending: isAllowing } = useAllow();
  const { data: isAllowed } = useIsAllowed({
    contractAddresses: [MARKET_CONTRACT_ADDRESS ?? "0x0000000000000000000000000000000000000000"],
  });

  const outcomeShareHandle = position?.[4];
  const hasClaimed = position?.[1] ?? false;
  const canDecrypt = Boolean(hasClaimed && outcomeShareHandle && !isZeroHandle(outcomeShareHandle) && isAllowed);

  const { data: decrypted, isPending: isDecrypting } = useUserDecrypt(
    {
      handles:
        canDecrypt && outcomeShareHandle && MARKET_CONTRACT_ADDRESS
          ? [{ handle: outcomeShareHandle, contractAddress: MARKET_CONTRACT_ADDRESS }]
          : [],
    },
    { enabled: canDecrypt },
  );

  useEffect(() => {
    if (isConfirmed) refetchPosition();
  }, [isConfirmed, refetchPosition]);

  if (!address) {
    return (
      <div className="rounded-md border border-bb-line bg-bb-black-soft p-5">
        <p className="text-sm text-bb-text-dim">Connect your wallet to check your outcome.</p>
      </div>
    );
  }

  if (!position || !position[0]) {
    return (
      <div className="rounded-md border border-bb-line bg-bb-black-soft p-5">
        <p className="text-sm text-bb-text-dim">
          You did not submit a prediction to this market before it closed.
        </p>
      </div>
    );
  }

  const decryptedShare = decrypted && outcomeShareHandle ? decrypted[outcomeShareHandle] : undefined;
  const shareValue = decryptedShare !== undefined ? BigInt(decryptedShare.toString()) : undefined;
  const isWin = shareValue !== undefined && shareValue > 0n;
  const formattedShare = shareValue !== undefined ? formatUnits(shareValue, decimals) : undefined;

  return (
    <div className="rounded-md border border-bb-line bg-bb-black-soft p-5">
      <h2 className="text-sm font-medium uppercase tracking-wide text-bb-text-dim">Your outcome</h2>

      {!hasClaimed && (
        <>
          <p className="mt-2 text-sm text-bb-text-dim">
            The market has resolved. Claim to compute your outcome and pay it out to your BBX balance — only
            you can decrypt the amount.
          </p>
          <button
            type="button"
            onClick={() =>
              MARKET_CONTRACT_ADDRESS &&
              writeContractAsync({
                address: MARKET_CONTRACT_ADDRESS,
                abi: BLACKBOX_MARKET_ABI,
                functionName: "claim",
                args: [marketId],
              })
            }
            disabled={isWriting || isConfirming}
            className="mt-4 w-full rounded-md bg-bb-yellow px-4 py-3 text-sm font-medium text-bb-black transition-opacity disabled:opacity-40"
          >
            {isWriting ? "Sending…" : isConfirming ? "Confirming…" : "Claim"}
          </button>
          {writeError && <p className="mt-3 text-xs text-red-400">{writeError.message}</p>}
        </>
      )}

      {hasClaimed && !isAllowed && (
        <>
          <p className="mt-2 text-sm text-bb-text-dim">
            Sign with your wallet to authorize decryption. This is a free signature — no gas required.
          </p>
          <button
            type="button"
            onClick={() => MARKET_CONTRACT_ADDRESS && allow([MARKET_CONTRACT_ADDRESS])}
            disabled={isAllowing}
            className="mt-4 w-full rounded-md bg-bb-yellow px-4 py-3 text-sm font-medium text-bb-black transition-opacity disabled:opacity-40"
          >
            {isAllowing ? "Waiting for signature…" : "Sign to decrypt"}
          </button>
        </>
      )}

      {hasClaimed && isAllowed && (
        <>
          {isDecrypting && (
            <p className="mt-3 text-sm text-bb-text-dim">Decrypting your result…</p>
          )}
          {!isDecrypting && shareValue === undefined && (
            <p className="mt-3 text-sm text-bb-text-dim">Decryption pending…</p>
          )}
          {!isDecrypting && shareValue !== undefined && (
            <div className="mt-3">
              {isWin ? (
                <>
                  <p className="text-xs uppercase tracking-wide text-bb-yellow">Correct prediction</p>
                  <p className="mt-1 text-3xl font-medium text-bb-text">{formattedShare} BBX</p>
                  <p className="mt-1 text-xs text-bb-text-dim">
                    Paid to your BBX balance · Sepolia testnet only, no real-world value · Only your wallet can
                    decrypt this amount
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs uppercase tracking-wide text-bb-text-dim">Prediction did not match</p>
                  <p className="mt-2 text-sm text-bb-text-dim">
                    Your outcome share is 0 BBX. The market resolved to a different outcome than you predicted.
                  </p>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
