import { Contract, JsonRpcProvider, NonceManager, Wallet } from "ethers";

import { BLACKBOX_MARKET_ABI } from "./abi.js";

export type ChainConfig = {
  rpcUrl: string;
  operatorPrivateKey: string;
  marketContractAddress: string;
};

export type MarketInfo = {
  exists: boolean;
  resolved: boolean;
  outcomeCount: number;
  winningOutcome: number;
  closingTime: number;
  eventType: string;
  label: string;
};

/**
 * The subset of chain operations the simulation engine needs. Fixture
 * orchestration (src/fixtures, src/engine.ts) depends on this interface,
 * not on the concrete ethers-backed client below, so it can be tested
 * with a plain stub object instead of a real provider and wallet.
 */
export interface ChainClient {
  createMarket(
    eventType: string,
    label: string,
    closingTime: number,
    outcomeOddsBps: number[],
  ): Promise<{ marketId: bigint; txHash: string }>;
  resolveMarket(marketId: bigint, winningOutcome: number): Promise<string>;
  getMarket(marketId: bigint): Promise<MarketInfo>;
}

/**
 * Thin wrapper around the BlackboxMarket contract for the operator role.
 * The wallet built here must be the contract's configured `operator`
 * address (see BlackboxMarket.setOperator) or every write call will revert
 * with NotOperator.
 */
export class BlackboxChainClient implements ChainClient {
  private readonly contract: Contract;

  constructor(config: ChainConfig) {
    const provider = new JsonRpcProvider(config.rpcUrl);
    const wallet = new Wallet(config.operatorPrivateKey, provider);
    const operator = new NonceManager(wallet);
    this.contract = new Contract(config.marketContractAddress, BLACKBOX_MARKET_ABI, operator);
  }

  /** Creates a market and returns the id assigned by the contract. */
  async createMarket(
    eventType: string,
    label: string,
    closingTime: number,
    outcomeOddsBps: number[],
  ): Promise<{ marketId: bigint; txHash: string }> {
    const tx = await this.contract.createMarket(eventType, label, closingTime, outcomeOddsBps);
    const receipt = await tx.wait();

    const created = receipt.logs
      .map((log: unknown) => {
        try {
          return this.contract.interface.parseLog(log as { topics: string[]; data: string });
        } catch {
          return null;
        }
      })
      .find((parsed: { name: string } | null) => parsed?.name === "MarketCreated");

    if (!created) {
      throw new Error("MarketCreated event not found in createMarket transaction receipt");
    }

    return { marketId: created.args.marketId as bigint, txHash: receipt.hash as string };
  }

  /** Resolves a market with the actual outcome. */
  async resolveMarket(marketId: bigint, winningOutcome: number): Promise<string> {
    const tx = await this.contract.resolveMarket(marketId, winningOutcome);
    const receipt = await tx.wait();
    return receipt.hash as string;
  }

  /** Reads the core fields of a market. */
  async getMarket(marketId: bigint): Promise<MarketInfo> {
    const result = await this.contract.getMarket(marketId);
    return {
      exists: result.exists as boolean,
      resolved: result.resolved as boolean,
      outcomeCount: Number(result.outcomeCount),
      winningOutcome: Number(result.winningOutcome),
      closingTime: Number(result.closingTime),
      eventType: result.eventType as string,
      label: result.label as string,
    };
  }
}
