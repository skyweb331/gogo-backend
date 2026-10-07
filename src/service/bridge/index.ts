import { Service } from 'typedi';

import { BridgeClient } from './client.js';
import { BridgeCustomersApi } from './customer.js';
import { BridgeKycLinksApi } from './kycLink.js';
import { BridgeWalletsApi } from './wallet.js';
import { BridgeVirtualAccountsApi } from './virtualAccount.js';
import { BridgeTransfersApi } from './transfer.js';
import { BridgeExchangeRatesApi } from './exchangeRate.js';
import { BridgeDeveloperApi } from './developer.js';

export { BridgeApiError } from './client.js';
export * from './types.js';
export type { ConfigureFeeExternalAccountInput, FeeExternalAccount } from './developer.js';

/** Typed facade over the Bridge v0 API. */
@Service()
export class BridgeService {
  readonly customers: BridgeCustomersApi;
  readonly kycLinks: BridgeKycLinksApi;
  readonly wallets: BridgeWalletsApi;
  readonly virtualAccounts: BridgeVirtualAccountsApi;
  readonly transfers: BridgeTransfersApi;
  readonly exchangeRates: BridgeExchangeRatesApi;
  readonly developer: BridgeDeveloperApi;

  constructor(readonly client: BridgeClient) {
    this.customers = new BridgeCustomersApi(client);
    this.kycLinks = new BridgeKycLinksApi(client);
    this.wallets = new BridgeWalletsApi(client);
    this.virtualAccounts = new BridgeVirtualAccountsApi(client);
    this.transfers = new BridgeTransfersApi(client);
    this.exchangeRates = new BridgeExchangeRatesApi(client);
    this.developer = new BridgeDeveloperApi(client);
  }

  get configured() {
    return this.client.configured;
  }
}
