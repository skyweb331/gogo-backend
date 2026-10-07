import type { BridgeClient } from './client.js';
import type {
  BridgeChain,
  BridgeFiat,
  BridgeList,
  BridgeStablecoin,
  BridgeVirtualAccount,
  BridgeVirtualAccountEvent,
} from './types.js';

export interface CreateVirtualAccountInput {
  customerId: string;
  sourceCurrency: BridgeFiat;
  destinationCurrency: BridgeStablecoin;
  chain: BridgeChain;
  bridgeWalletId: string;
}

export interface ActivityQuery {
  limit?: number;
  starting_after?: string;
  ending_before?: string;
  event_type?: string;
  deposit_id?: string;
  updated_after_ms?: number;
}

export class BridgeVirtualAccountsApi {
  constructor(private readonly client: BridgeClient) {}

  /**
   * Fiat in -> stablecoin into the customer's Bridge custodial wallet with a 0% fee.
   * GOGO's tiered fee is applied later on the payout transfer (`developer_fee`).
   */
  create(input: CreateVirtualAccountInput) {
    return this.client.post<BridgeVirtualAccount>(
      `/customers/${encodeURIComponent(input.customerId)}/virtual_accounts`,
      {
        source: { currency: input.sourceCurrency },
        destination: {
          currency: input.destinationCurrency,
          payment_rail: input.chain,
          bridge_wallet_id: input.bridgeWalletId,
        },
        developer_fee_percent: '0',
      },
      { idempotencyKey: `va-${input.customerId}-${input.sourceCurrency}` }
    );
  }

  get(customerId: string, virtualAccountId: string) {
    return this.client.get<BridgeVirtualAccount>(
      `/customers/${encodeURIComponent(customerId)}/virtual_accounts/${encodeURIComponent(virtualAccountId)}`
    );
  }

  list(customerId: string) {
    return this.client.get<BridgeList<BridgeVirtualAccount>>(
      `/customers/${encodeURIComponent(customerId)}/virtual_accounts`
    );
  }

  deactivate(customerId: string, virtualAccountId: string) {
    return this.client.post<BridgeVirtualAccount>(
      `/customers/${encodeURIComponent(customerId)}/virtual_accounts/${encodeURIComponent(virtualAccountId)}/deactivate`,
      {},
      { idempotencyKey: `va-deactivate-${virtualAccountId}-${Date.now()}` }
    );
  }

  reactivate(customerId: string, virtualAccountId: string) {
    return this.client.post<BridgeVirtualAccount>(
      `/customers/${encodeURIComponent(customerId)}/virtual_accounts/${encodeURIComponent(virtualAccountId)}/reactivate`,
      {},
      { idempotencyKey: `va-reactivate-${virtualAccountId}-${Date.now()}` }
    );
  }

  /** Activity for one virtual account (newest first). */
  history(customerId: string, virtualAccountId: string, query: ActivityQuery = {}) {
    return this.client.get<BridgeList<BridgeVirtualAccountEvent>>(
      `/customers/${encodeURIComponent(customerId)}/virtual_accounts/${encodeURIComponent(virtualAccountId)}/history`,
      { query: { ...query } }
    );
  }

  /** Activity across all customers (newest first), cursor paginated by event id. */
  allHistory(query: ActivityQuery = {}) {
    return this.client.get<BridgeList<BridgeVirtualAccountEvent>>('/virtual_accounts/history', {
      query: { limit: 100, ...query },
    });
  }
}
