import { Contract, JsonRpcProvider, NonceManager, Wallet } from 'ethers';
import { BLACKBOX_MARKET_ABI } from './abi.js';
export type ChainConfig = { rpcUrl: string; operatorPrivateKey: string; marketContractAddress: string };
export type MarketInfo = { exists: boolean; resolved: boolean; outcomeCount: number; winningOutcome: number;
  closingTime: number; eventType: string; label: string; commitment: string; cancelled: boolean };
export class CreationExpiredError extends Error {}
export interface ChainClient {
  createMarket(eventType: string, label: string, closingTime: number, odds: number[], commitment: string, key: string): Promise<{marketId: bigint; txHash: string}>;
  resolveMarket(marketId: bigint, seed: string): Promise<string>;
  cancelExpired(marketId: bigint): Promise<string>;
  getMarket(marketId: bigint): Promise<MarketInfo>;
}
export class BlackboxChainClient implements ChainClient {
  private readonly provider: JsonRpcProvider;
  private readonly signer: NonceManager;
  private readonly contract: Contract;
  constructor(config: ChainConfig) {
    this.provider = new JsonRpcProvider(config.rpcUrl);
    this.signer = new NonceManager(new Wallet(config.operatorPrivateKey, this.provider));
    this.contract = new Contract(config.marketContractAddress, BLACKBOX_MARKET_ABI, this.signer);
  }
  async assertReady(): Promise<string> {
    const {chainId} = await this.provider.getNetwork();
    if (![31337n, 11155111n].includes(chainId)) throw new Error('Only local Hardhat and Sepolia are supported');
    if (await this.contract.PROTOCOL_VERSION() !== 2n) throw new Error('Expected protocol v2');
    if ((await this.contract.operator()).toLowerCase() !== (await this.signer.getAddress()).toLowerCase()) throw new Error('Signer is not the market operator');
    return chainId.toString();
  }
  async createMarket(eventType: string, label: string, closingTime: number, odds: number[], commitment: string, key: string) {
    const recover = async () => {
      const slot: bigint = await this.contract.marketByKey(key);
      if (slot === 0n) return null;
      const marketId = slot - 1n;
      const m = await this.getMarket(marketId);
      const storedOdds = await this.contract.getMarketOdds(marketId);
      if (!m.exists || m.commitment.toLowerCase() !== commitment.toLowerCase() || m.eventType !== eventType ||
          m.closingTime !== closingTime || m.label !== label || storedOdds.map(Number).join(',') !== odds.join(',')) throw new Error('Creation key has conflicting market data');
      return {marketId, txHash: 'recovered-by-creation-key'};
    };
    const existing = await recover();
    if (existing) return existing;
    const block = await this.provider.getBlock('latest');
    if (!block) throw new Error('Missing latest block');
    if (block.timestamp >= closingTime) {
      const recovered = await recover();
      if (recovered) return recovered;
      throw new CreationExpiredError('Creation window closed with no market for key');
    }
    try {
      const receipt = await (await this.contract.createMarket(eventType, label, closingTime, odds, commitment, key)).wait();
      for (const log of receipt.logs) {
        try {
          const parsed = this.contract.interface.parseLog(log);
          if (parsed?.name === 'MarketCreated') return {marketId: parsed.args.marketId as bigint, txHash: receipt.hash as string};
        } catch { /* unrelated token log */ }
      }
      throw new Error('Missing MarketCreated receipt event; recover by key on retry');
    } catch (error) { this.signer.reset(); throw error; }
  }
  async resolveMarket(id: bigint, seed: string): Promise<string> {
    try { return (await (await this.contract.resolveMarket(id, seed)).wait()).hash; }
    catch (error) { this.signer.reset(); throw error; }
  }
  async cancelExpired(id: bigint): Promise<string> {
    try { return (await (await this.contract.cancelExpired(id)).wait()).hash; }
    catch (error) { this.signer.reset(); throw error; }
  }
  async getMarket(id: bigint): Promise<MarketInfo> {
    const [m, e] = await Promise.all([this.contract.getMarket(id), this.contract.getMarketEvidence(id)]);
    if (e.version !== 2n) throw new Error('Expected protocol v2');
    return {exists: m.exists, resolved: m.resolved, outcomeCount: Number(m.outcomeCount), winningOutcome: Number(m.winningOutcome),
      closingTime: Number(m.closingTime), eventType: m.eventType, label: m.label, commitment: e.commitment, cancelled: e.cancelled};
  }
}
