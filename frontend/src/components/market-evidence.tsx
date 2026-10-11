"use client";
import {useQuery} from '@tanstack/react-query';
import {keccak256, type Hex} from 'viem';
import {useAccount, usePublicClient, useWaitForTransactionReceipt, useWriteContract} from 'wagmi';
import {BLACKBOX_MARKET_ABI, MARKET_CONTRACT_ADDRESS} from '@/lib/contract';
import {simulateV2} from '@/lib/generated/protocol.mjs';
export function MarketEvidence({marketId}: {marketId: bigint}) {
  const client = usePublicClient({chainId: 11155111});
  const {chainId} = useAccount();
  const {writeContractAsync, data: hash, isPending, error} = useWriteContract();
  const receipt = useWaitForTransactionReceipt({hash, chainId: 11155111});
  const evidence = useQuery({queryKey: ['market-evidence-v2', MARKET_CONTRACT_ADDRESS, marketId.toString(), receipt.isSuccess],
    enabled: Boolean(client && MARKET_CONTRACT_ADDRESS), refetchInterval: 5000,
    queryFn: async () => {
      if (!client || !MARKET_CONTRACT_ADDRESS) throw new Error('Missing configuration');
      const block = await client.getBlock();
      if (block.number === null) throw new Error('Missing block number');
      const options = {address: MARKET_CONTRACT_ADDRESS, abi: BLACKBOX_MARKET_ABI, args: [marketId], blockNumber: block.number} as const;
      const [market, proof, code] = await Promise.all([
        client.readContract({...options, functionName: 'getMarket'}),
        client.readContract({...options, functionName: 'getMarketEvidence'}),
        client.getCode({address: MARKET_CONTRACT_ADDRESS, blockNumber: block.number})
      ]);
      if (!market[0] || proof[3] !== 2n || !code || code === '0x') throw new Error('Expected an existing protocol v2 market');
      const expected = market[1] && !proof[2] ? simulateV2(market[5], proof[1], bytes => keccak256(bytes as Hex)) : null;
      const verified = expected !== null && keccak256(proof[1]) === proof[0] && expected === market[3];
      return {chainId: 11155111, contract: MARKET_CONTRACT_ADDRESS, marketId: marketId.toString(), protocolVersion: 2,
        blockNumber: block.number.toString(), blockHash: block.hash, codeHash: keccak256(code),
        commitment: proof[0], seed: market[1] && !proof[2] ? proof[1] : null, cancelled: proof[2], resolved: market[1],
        expectedOutcome: expected, actualOutcome: market[1] && !proof[2] ? market[3] : null, verified,
        canCancel: !market[1] && block.timestamp >= market[4] + 86400n,
        limitation: 'RPC snapshot; verifies seed consistency and deterministic outcome, not unbiased randomness, solvency or independent audit.'};
    }});
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(evidence.data, null, 2)], {type: 'application/json'}));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `blackbox-${marketId}-evidence.json`; anchor.click(); URL.revokeObjectURL(url);
  }
  const d = evidence.data;
  return <section className="rounded-md border border-bb-line p-5 space-y-3 break-words">
    <h2>Public result evidence</h2>
    {evidence.isError ? <p className="text-red-400">Evidence unavailable. This market is not verified.</p> : !d ? <p>Reading evidence…</p> : <>
      <p>{d.cancelled ? 'Cancelled after the reveal deadline. Claim actual principal.' : !d.resolved ? 'Seed committed. Awaiting reveal after closing.' : d.verified ? 'Seed and result match protocol v2.' : 'Verification failed: seed or result mismatch.'}</p>
      <p className="text-xs">Commitment: {d.commitment}</p>
      {d.seed && <p className="text-xs">Revealed seed: {d.seed}</p>}
      <p className="text-xs">Snapshot block: {d.blockNumber}</p>
      <button className="text-bb-yellow" onClick={download}>Download public evidence</button>
      {d.canCancel && <button className="block text-bb-yellow disabled:opacity-40" disabled={chainId !== 11155111 || isPending || receipt.isLoading} onClick={() => {if (MARKET_CONTRACT_ADDRESS) void writeContractAsync({chainId: 11155111, address: MARKET_CONTRACT_ADDRESS, abi: BLACKBOX_MARKET_ABI, functionName: 'cancelExpired', args: [marketId]}).catch(() => {});}}>Cancel expired market</button>}
    </>}
    <p className="text-xs text-bb-text-dim">The operator chooses and knows the seed in advance. A matching commitment cannot prove unbiased randomness or funded payouts. Participation and transaction timing remain public.</p>
    {(error || receipt.error) && <p className="text-red-400">Cancellation failed. Refresh the market before retrying.</p>}
    {hash && <a href={`https://sepolia.etherscan.io/tx/${hash}`} className="text-bb-yellow">View cancellation transaction</a>}
  </section>;
}
