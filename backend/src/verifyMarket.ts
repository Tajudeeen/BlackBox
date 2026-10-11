// Read-only verifier. No signer, operator key or database required.
import 'dotenv/config';
import {Contract, JsonRpcProvider, isAddress, keccak256} from 'ethers';
import {BLACKBOX_MARKET_ABI} from './chain/abi.js';
import {simulateV2} from './generated/protocol.mjs';
async function main() {
  const address = process.env.MARKET_CONTRACT_ADDRESS, rpc = process.env.RPC_URL, arg = process.argv[2];
  if (!rpc || !address || !isAddress(address) || !arg || !/^\d+$/.test(arg)) throw new Error('Set RPC_URL and MARKET_CONTRACT_ADDRESS; pass a nonnegative market ID');
  const provider = new JsonRpcProvider(rpc);
  try {
    const {chainId} = await provider.getNetwork();
    if (![31337n, 11155111n].includes(chainId)) throw new Error('Unsupported chain');
    const block = await provider.getBlock('latest');
    if (!block) throw new Error('No block');
    const c = new Contract(address, BLACKBOX_MARKET_ABI, provider), options = {blockTag: block.number};
    const [m, e, code] = await Promise.all([c.getMarket(BigInt(arg), options), c.getMarketEvidence(BigInt(arg), options), provider.getCode(address, block.number)]);
    if (!m.exists || e.version !== 2n || code === '0x') throw new Error('Expected existing v2 market');
    const expected = m.resolved && !e.cancelled ? simulateV2(m.eventType, e.seed, keccak256) : null;
    const verified = expected !== null && keccak256(e.seed) === e.commitment && expected === Number(m.winningOutcome);
    console.log(JSON.stringify({chainId: chainId.toString(), address, marketId: arg, blockNumber: block.number, blockHash: block.hash,
      codeHash: keccak256(code), commitment: e.commitment, seed: m.resolved && !e.cancelled ? e.seed : null,
      resolved: m.resolved, cancelled: e.cancelled, expectedOutcome: expected, verified,
      limitation: 'RPC snapshot consistency check, not unbiased randomness, solvency or an independent audit.'}, null, 2));
    if (m.resolved && !e.cancelled && !verified) process.exitCode = 1;
  } finally {provider.destroy();}
}
main().catch(() => {console.error('Verification failed: check configuration, RPC and market evidence.'); process.exitCode = 1;});
