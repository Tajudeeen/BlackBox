export type EngineConfig = {
  rpcUrl: string;
  operatorPrivateKey: string;
  marketContractAddress: string;
  databaseUrl: string;
  closingInSeconds: number;
  pollIntervalMs: number;
  haltRecoveryMs: number;
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
  return {
    rpcUrl: process.env.RPC_URL ?? "http://127.0.0.1:8545",
    operatorPrivateKey: required("OPERATOR_PRIVATE_KEY"),
    marketContractAddress: required("MARKET_CONTRACT_ADDRESS"),
    databaseUrl: process.env.DATABASE_URL ?? "postgres://blackbox:blackbox_dev_only@localhost:5432/blackbox",
    closingInSeconds: Number(process.env.CLOSING_IN_SECONDS ?? 1800),
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 15_000),
    // How long a generator stays halted after a partial fixture-creation
    // failure (e.g. the operator wallet running out of gas) before the
    // engine automatically retries it on its own. Defaults to 2 minutes --
    // short enough that a transient issue clears itself quickly, long
    // enough that a genuinely broken config (bad RPC url, wrong contract
    // address) doesn't retry so fast it spams the chain. A redeploy also
    // clears the halt immediately, since it's in-memory only -- this
    // timer only matters if the same process keeps running without
    // restarting.
    haltRecoveryMs: Number(process.env.HALT_RECOVERY_MS ?? 120_000),
  };
}
