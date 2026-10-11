// Version 2 has no arbitrary-result override. This only cancels expired markets.
import 'dotenv/config';
import { BlackboxChainClient } from './chain/client.js';
import { loadConfig } from './config.js';
async function main() {
  const arg = process.argv[2];
  if (!arg || !/^\d+$/.test(arg)) throw new Error('Usage: npx tsx src/adminResolve.ts <expiredMarketId>');
  const chain = new BlackboxChainClient(loadConfig());
  await chain.assertReady();
  console.log(await chain.cancelExpired(BigInt(arg)));
}
main().catch(() => {console.error('Cancellation failed. Check chain, configuration and reveal deadline.'); process.exitCode = 1;});
