import type { BridgeClient } from './client.js';
import type { BridgeExchangeRate } from './types.js';

export class BridgeExchangeRatesApi {
  private readonly cache = new Map<string, { at: number; rate: BridgeExchangeRate }>();

  constructor(private readonly client: BridgeClient) {}

  /** Bridge refreshes rates about every 30s; cache for the same window. */
  async get(from: string, to: string): Promise<BridgeExchangeRate> {
    const key = `${from}:${to}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < 30_000) return cached.rate;
    const rate = await this.client.get<BridgeExchangeRate>('/exchange_rates', {
      query: { from, to },
    });
    this.cache.set(key, { at: Date.now(), rate });
    return rate;
  }
}
