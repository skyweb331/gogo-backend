import type { BridgeClient } from './client.js';
import type { BridgeTransfer, CreateTransferRequest } from './types.js';

export const TRANSFER_TERMINAL_SUCCESS = new Set(['payment_processed']);
export const TRANSFER_TERMINAL_FAILURE = new Set([
  'undeliverable',
  'returned',
  'missing_return_policy',
  'refunded',
  'refund_failed',
  'canceled',
  'error',
]);

export class BridgeTransfersApi {
  constructor(private readonly client: BridgeClient) {}

  /**
   * Custodial wallet -> customer payout wallet with NxPay's exact `developer_fee`.
   * `developer_fee` is denominated in the fiat the source stablecoin is pegged to
   * (USD for USDC, EUR for EURC).
   */
  create(request: CreateTransferRequest, idempotencyKey: string) {
    return this.client.post<BridgeTransfer>('/transfers', request, { idempotencyKey });
  }

  get(transferId: string) {
    return this.client.get<BridgeTransfer>(`/transfers/${encodeURIComponent(transferId)}`);
  }
}
