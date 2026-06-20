"use client";

import { isZeroHandle, useAllow, useIsAllowed, useUserDecrypt } from "@zama-fhe/react-sdk";
import { useEffect } from "react";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { BLACKBOX_MARKET_ABI, MARKET_CONTRACT_ADDRESS } from "@/lib/contract";

export function ClaimPanel({ marketId }: { marketId: bigint }) {
  const { address } = useAccount();

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

  if (!position || !position[0]) {
    return null; // no position in this market
  }

  const decryptedShare = decrypted && outcomeShareHandle ? decrypted[outcomeShareHandle] : undefined;

  return (
    <div className="rounded-md border border-bb-line bg-bb-black-soft p-5">
      <h2 className="text-sm font-medium uppercase tracking-wide text-bb-text-dim">Your outcome share</h2>

      {!hasClaimed && (
        <>
          <p className="mt-2 text-sm text-bb-text-dim">
            This market is resolved. Claim to compute your outcome share — only you will be able to decrypt it.
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
            {isWriting || isConfirming ? "Claiming…" : "Claim"}
          </button>
          {writeError && <p className="mt-3 text-xs text-red-400">{writeError.message}</p>}
        </>
      )}

      {hasClaimed && !isAllowed && (
        <>
          <p className="mt-2 text-sm text-bb-text-dim">
            Sign once to authorize decrypting your results from this market. This does not cost gas.
          </p>
          <button
            type="button"
            onClick={() => MARKET_CONTRACT_ADDRESS && allow([MARKET_CONTRACT_ADDRESS])}
            disabled={isAllowing}
            className="mt-4 w-full rounded-md bg-bb-yellow px-4 py-3 text-sm font-medium text-bb-black transition-opacity disabled:opacity-40"
          >
            {isAllowing ? "Signing…" : "Authorize decryption"}
          </button>
        </>
      )}

      {hasClaimed && isAllowed && (
        <p className="mt-2 text-2xl font-medium text-bb-text">
          {isDecrypting ? "Decrypting…" : decryptedShare !== undefined ? decryptedShare.toString() : "—"}
        </p>
      )}
    </div>
  );
}
