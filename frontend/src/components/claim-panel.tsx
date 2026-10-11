"use client";
import { isZeroHandle, useAllow, useIsAllowed, useUserDecrypt } from '@zama-fhe/react-sdk';
import { formatUnits } from 'viem';
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { BLACKBOX_MARKET_ABI, MARKET_CONTRACT_ADDRESS } from '@/lib/contract';
import { useTokenDecimals } from '@/lib/useToken';
export function ClaimPanel({marketId, resolved = true}: {marketId: bigint; resolved?: boolean}) {
  const {address, chainId} = useAccount();
  const decimals = useTokenDecimals();
  const position = useReadContract({chainId: 11155111, address: MARKET_CONTRACT_ADDRESS, abi: BLACKBOX_MARKET_ABI,
    functionName: 'getPosition', args: address ? [marketId, address] : undefined,
    query: {enabled: Boolean(address && MARKET_CONTRACT_ADDRESS), refetchInterval: 3000}});
  const payment = useReadContract({chainId: 11155111, address: MARKET_CONTRACT_ADDRESS, abi: BLACKBOX_MARKET_ABI,
    functionName: 'getPayment', args: address ? [marketId, address] : undefined,
    query: {enabled: Boolean(address && MARKET_CONTRACT_ADDRESS), refetchInterval: 3000}});
  const {mutate: allow, isPending: isAllowing, error: allowError} = useAllow();
  const {data: allowed} = useIsAllowed({contractAddresses: [MARKET_CONTRACT_ADDRESS ?? '0x0000000000000000000000000000000000000000']});
  const rawHandles = [position.data?.[3], position.data?.[4], payment.data?.[0], payment.data?.[1]];
  const handles = rawHandles.filter((h): h is `0x${string}` => Boolean(h && !isZeroHandle(h)));
  const {data: decrypted, error: decryptError, isPending: decrypting} = useUserDecrypt({
    handles: allowed && MARKET_CONTRACT_ADDRESS ? handles.map(handle => ({handle, contractAddress: MARKET_CONTRACT_ADDRESS!})) : []
  }, {enabled: Boolean(allowed && MARKET_CONTRACT_ADDRESS && handles.length)});
  const values = rawHandles.map(h => h && decrypted?.[h] !== undefined ? BigInt(decrypted[h].toString()) : undefined);
  const {writeContractAsync, data: hash, isPending: writing, error: writeError} = useWriteContract();
  const receipt = useWaitForTransactionReceipt({hash, chainId: 11155111});
  const claimed = position.data?.[1];
  if (!address) return <p>Connect your wallet to view your position.</p>;
  if (position.error || payment.error) return <p>Position evidence is unavailable. Refresh or check your RPC connection.</p>;
  if (!position.data) return <p>Loading your position…</p>;
  if (!position.data[0]) return <p>No position for this wallet.</p>;
  return <section className="rounded-md border border-bb-line bg-bb-black-soft p-5 space-y-3">
    <h2>Your deposit and payments</h2>
    <p className="text-xs text-bb-text-dim">A confirmed claim computes entitlement and attempts payment. It does not prove that funds moved. BBX is a testnet token with no real-world value.</p>
    {!allowed && <button disabled={isAllowing} onClick={() => MARKET_CONTRACT_ADDRESS && allow([MARKET_CONTRACT_ADDRESS])} className="text-bb-yellow">{isAllowing ? 'Waiting for signature…' : 'Sign to decrypt amounts'}</button>}
    {allowed && <dl className="space-y-2">{['Actually deposited', 'Entitlement', 'Actually paid', 'Still owed'].map((label, i) => <div key={label} className="flex justify-between gap-4"><dt>{label}</dt><dd>{i > 0 && !claimed ? 'Not computed' : values[i] === undefined ? 'Awaiting decryption' : `${formatUnits(values[i]!, decimals)} BBX`}</dd></div>)}</dl>}
    {allowed && decrypting && <p>Decrypting…</p>}
    {values[3] !== undefined && values[3] > 0n && <p className="text-bb-yellow">Payment remains outstanding. Retry after the pool is funded. Funding is not guaranteed.</p>}
    {values[3] === 0n && claimed && <p>{values[2] && values[2] > 0n ? 'Payment completed.' : 'No payment is due.'}</p>}
    {resolved && <button className="rounded bg-bb-yellow text-bb-black px-4 py-2 disabled:opacity-40" disabled={chainId !== 11155111 || writing || receipt.isLoading || (claimed && values[3] === 0n)}
      onClick={() => { if (MARKET_CONTRACT_ADDRESS) void writeContractAsync({chainId: 11155111, address: MARKET_CONTRACT_ADDRESS, abi: BLACKBOX_MARKET_ABI, functionName: 'claim', args: [marketId]}).catch(() => {}); }}>
      {writing ? 'Confirm in wallet…' : receipt.isLoading ? 'Confirming…' : claimed ? 'Retry unpaid amount' : 'Compute entitlement and request payment'}
    </button>}
    {chainId !== 11155111 && <p>Switch to Sepolia to transact.</p>}
    {hash && <a className="block text-bb-yellow" href={`https://sepolia.etherscan.io/tx/${hash}`} target="_blank" rel="noreferrer">View claim transaction</a>}
    {(allowError || decryptError || writeError || receipt.error) && <p className="text-red-400">{(allowError || decryptError || writeError || receipt.error)?.message}</p>}
  </section>;
}
