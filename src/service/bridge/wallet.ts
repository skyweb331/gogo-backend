import type { BridgeClient } from './client.js';
import { assertSandbox } from './customer.js';
import type { BridgeChain, BridgeWallet } from './types.js';

/** Bridge custodial wallets (the in-flight hop between virtual account and payout). */
export class BridgeWalletsApi {
  constructor(private readonly client: BridgeClient) {}

  create(customerId: string, chain: BridgeChain) {
    return this.client.post<BridgeWallet>(
      `/customers/${encodeURIComponent(customerId)}/wallets`,
      { chain },
      { idempotencyKey: `custodial-wallet-${customerId}-${chain}` }
    );
  }

  get(customerId: string, walletId: string) {
    return this.client.get<BridgeWallet>(
      `/customers/${encodeURIComponent(customerId)}/wallets/${encodeURIComponent(walletId)}`
    );
  }

  list(customerId: string) {
    return this.client.get<{ count?: number; data: BridgeWallet[] }>(
      `/customers/${encodeURIComponent(customerId)}/wallets`
    );
  }

  /** Balance of one currency (e.g. `usdc`) as a decimal string, "0" if absent. */
  async balance(customerId: string, walletId: string, currency: string) {
    const wallet = await this.get(customerId, walletId);
    const entry = wallet.balances?.find((b) => b.currency.toLowerCase() === currency.toLowerCase());
    return entry?.balance ?? '0';
  }

  /** Sandbox only: credit a custodial wallet. */
  simulateDeposit(
    customerId: string,
    walletId: string,
    amount: string,
    currency: string,
    idempotencyKey: string
  ) {
    assertSandbox('simulateDeposit');
    return this.client.post<unknown>(
      `/customers/${encodeURIComponent(customerId)}/wallets/${encodeURIComponent(walletId)}/simulate_deposit`,
      { amount, currency },
      { idempotencyKey }
    );
  }
}
