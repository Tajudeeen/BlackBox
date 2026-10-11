import { isAddress } from "ethers";
export type EngineConfig = {
  rpcUrl: string;
  operatorPrivateKey: string;
  marketContractAddress: string;
  databaseUrl: string;
  closingInSeconds: number;
  pollIntervalMs: number;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

/** Loads engine configuration from the environment (see .env.example). */
export function loadConfig(): EngineConfig {
  if (!/^0x[0-9a-fA-F]{64}$/.test(required('OPERATOR_PRIVATE_KEY'))) throw new Error('Invalid operator private key');
  if (!isAddress(required('MARKET_CONTRACT_ADDRESS'))) throw new Error('Invalid market address');
  for (const [name, fallback, minimum] of [['CLOSING_IN_SECONDS', 1800, 30], ['POLL_INTERVAL_MS', 15000, 1000]] as const) {
    const value = Number(process.env[name] ?? fallback);
    if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`Invalid ${name}`);
  }
  return {
    rpcUrl: required("RPC_URL"),
    operatorPrivateKey: required("OPERATOR_PRIVATE_KEY"),
    marketContractAddress: required("MARKET_CONTRACT_ADDRESS"),
    databaseUrl: required("DATABASE_URL"),
    closingInSeconds: Number(process.env.CLOSING_IN_SECONDS ?? 1800),
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 15_000),
  };
}
