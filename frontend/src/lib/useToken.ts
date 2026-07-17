"use client";

import { isZeroHandle, useAllow, useIsAllowed, useUserDecrypt } from "@zama-fhe/react-sdk";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";

import { BLACKBOX_COIN_ABI, BLACKBOX_MARKET_ABI, MARKET_CONTRACT_ADDRESS } from "@/lib/contract";

const POLL_INTERVAL_MS = 5_000;

/**
 * Reads BlackboxCoin's address from the deployed market's own TOKEN()
 * getter, rather than a second environment variable -- see contract.ts
 * for why.
 */
export function useTokenAddress() {
  const { data: tokenAddress, isLoading } = useReadContract({
    address: MARKET_CONTRACT_ADDRESS,
    abi: BLACKBOX_MARKET_ABI,
    functionName: "TOKEN",
    query: { enabled: Boolean(MARKET_CONTRACT_ADDRESS) },
  });
  return { tokenAddress, isLoading };
}

/**
 * Reads the token's decimals (ERC-7984 recommends, and BlackboxCoin uses,
 * 6). This is purely a display/input-scaling convention, same as any
 * ERC-20 -- the contract itself only ever operates on raw integer
 * smallest-units; nothing about FHE or ERC-7984 requires decimals at the
 * contract logic level. Every raw on-chain amount in this app (escrow,
 * payout, balance) must be converted through this value before showing
 * it to a person or before turning what a person typed into a raw amount
 * to encrypt -- get this wrong in either direction and amounts will be
 * off by a factor of 10^decimals.
 */
export function useTokenDecimals() {
  const { tokenAddress } = useTokenAddress();
  const { data: decimals } = useReadContract({
    address: tokenAddress,
    abi: BLACKBOX_COIN_ABI,
    functionName: "decimals",
    query: { enabled: Boolean(tokenAddress) },
  });
  return decimals ?? 6;
}

/**
 * Reads and decrypts the connected wallet's confidential BBX balance,
 * returned both as the raw on-chain integer and as a human-readable
 * formatted string already scaled by decimals.
 *
 * The decrypt authorization here is a separate one-time step from the
 * ERC-7984 "operator" approval used elsewhere in this app (see
 * useOperatorApproval below) -- the two are unrelated concepts that
 * happen to share the word "operator" in their respective standards:
 *
 * - This hook's `useAllow`/`useIsAllowed` is the Zama FHE relayer's own
 *   decrypt authorization: "let the relayer decrypt BlackboxCoin's
 *   ciphertexts for my wallet." One signature, scoped to the token
 *   contract's address, needed before a balance can be shown at all.
 * - useOperatorApproval's `setOperator` is BlackboxCoin's ERC-7984
 *   spend authorization: "let BlackboxMarket move my confidential
 *   tokens." A completely different permission, needed before
 *   submitting a prediction specifically.
 *
 * A user may need to grant both, for different reasons, and this app's
 * copy is deliberately careful not to call both of them "operator" in
 * the same breath.
 */
export function useTokenBalance() {
  const { address } = useAccount();
  const { tokenAddress } = useTokenAddress();
  const decimals = useTokenDecimals();

  const { data: balanceHandle, refetch: refetchBalanceHandle } = useReadContract({
    address: tokenAddress,
    abi: BLACKBOX_COIN_ABI,
    functionName: "confidentialBalanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(tokenAddress && address),
      refetchInterval: POLL_INTERVAL_MS,
    },
  });

  const { mutate: allowDecrypt, isPending: isAuthorizingDecrypt } = useAllow();
  const { data: isDecryptAllowed } = useIsAllowed({
    contractAddresses: [tokenAddress ?? "0x0000000000000000000000000000000000000000"],
  });

  const hasBalance = Boolean(balanceHandle && !isZeroHandle(balanceHandle));
  const canDecrypt = Boolean(isDecryptAllowed && hasBalance && tokenAddress);

  const { data: decrypted, isPending: isDecrypting } = useUserDecrypt(
    {
      handles:
        canDecrypt && balanceHandle && tokenAddress
          ? [{ handle: balanceHandle, contractAddress: tokenAddress }]
          : [],
    },
    { enabled: canDecrypt },
  );

  const rawBalance =
    decrypted && balanceHandle && decrypted[balanceHandle] !== undefined
      ? BigInt(decrypted[balanceHandle].toString())
      : undefined;

  const formattedBalance = rawBalance !== undefined ? formatUnits(rawBalance, decimals) : undefined;

  return {
    tokenAddress,
    decimals,
    balanceHandle,
    rawBalance,
    formattedBalance,
    hasBalance,
    isDecryptAllowed: Boolean(isDecryptAllowed),
    authorizeDecrypt: () => tokenAddress && allowDecrypt([tokenAddress]),
    isAuthorizingDecrypt,
    isDecrypting,
    refetchBalanceHandle,
  };
}

/** Mints free testnet BBX to the connected wallet, subject to the on-chain cooldown. */
export function useFaucet() {
  const { tokenAddress } = useTokenAddress();
  const decimals = useTokenDecimals();
  const { data: faucetAmountRaw } = useReadContract({
    address: tokenAddress,
    abi: BLACKBOX_COIN_ABI,
    functionName: "FAUCET_AMOUNT",
    query: { enabled: Boolean(tokenAddress) },
  });
  const { writeContractAsync, isPending, error } = useWriteContract();

  const claim = async () => {
    if (!tokenAddress) return;
    await writeContractAsync({
      address: tokenAddress,
      abi: BLACKBOX_COIN_ABI,
      functionName: "faucet",
    });
  };

  const formattedFaucetAmount =
    faucetAmountRaw !== undefined ? formatUnits(faucetAmountRaw, decimals) : undefined;

  return { claim, isPending, error, formattedFaucetAmount };
}

/**
 * ERC-7984 operator approval: authorizes BlackboxMarket to move the
 * connected wallet's confidential BBX. Required once before a wallet's
 * first prediction submission -- see this file's top comment for how
 * this differs from the FHE decrypt authorization above.
 */
export function useOperatorApproval() {
  const { address } = useAccount();
  const { tokenAddress } = useTokenAddress();

  const { data: isApproved, refetch: refetchApproval } = useReadContract({
    address: tokenAddress,
    abi: BLACKBOX_COIN_ABI,
    functionName: "isOperator",
    args: address && MARKET_CONTRACT_ADDRESS ? [address, MARKET_CONTRACT_ADDRESS] : undefined,
    query: {
      enabled: Boolean(tokenAddress && address && MARKET_CONTRACT_ADDRESS),
      refetchInterval: POLL_INTERVAL_MS,
    },
  });

  const { writeContractAsync, isPending, error } = useWriteContract();

  const approve = async () => {
    if (!tokenAddress || !MARKET_CONTRACT_ADDRESS) return;
    // Approve for a long, fixed window (roughly 1 year) rather than
    // prompting again soon -- a one-time approval, in spirit matching
    // an ERC-20 "infinite approval," not a per-prediction one.
    const oneYearFromNow = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
    await writeContractAsync({
      address: tokenAddress,
      abi: BLACKBOX_COIN_ABI,
      functionName: "setOperator",
      args: [MARKET_CONTRACT_ADDRESS, oneYearFromNow],
    });
    await refetchApproval();
  };

  return { isApproved: Boolean(isApproved), approve, isPending, error };
}

/** Converts a human-typed BBX amount string into the raw on-chain integer, using the token's decimals. */
export function parseTokenAmount(input: string, decimals: number): bigint {
  return parseUnits(input, decimals);
}
