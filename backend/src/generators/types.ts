/**
 * Generator interface. Every virtual sport implements this.
 *
 * A generator is responsible for:
 * - declaring what markets it creates per fixture (labels, odds)
 * - simulating an outcome deterministically from a seed
 *
 * The engine calls getMarkets() to create on-chain markets, then
 * simulate() after closing time to resolve them. The outcomes array
 * returned by simulate() maps 1:1 to the markets array from getMarkets()
 * by index -- markets[0] gets outcomes[0], markets[1] gets outcomes[1],
 * and so on.
 */
export type GeneratorMarket = {
  eventType: string;
  label: string;
  oddsBps: number[];
};

export type GeneratorResult = {
  /** One winning outcome index per market, in the same order as getMarkets(). */
  outcomes: number[];
  /** Public, non-financial description of what happened. */
  summary: string;
};

export interface Generator {
  /** Unique machine name for this generator, used in the database and logs. */
  name: string;
  /** Returns the markets this generator creates per fixture. */
  getMarkets(): GeneratorMarket[];
  /** Deterministically simulates an outcome from a seed. */
  simulate(seedHex: string): GeneratorResult;
}
