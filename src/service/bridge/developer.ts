import type { BridgeClient } from './client.js';

export interface FeeExternalAccount {
  id: string;
  account_type: 'us';
  currency: 'usd';
  account_owner_name: string;
  bank_name?: string;
  last_4?: string;
  active: boolean;
  account?: { last_4?: string; routing_number?: string; checking_or_savings?: string };
  created_at?: string;
  updated_at?: string;
}

export interface ConfigureFeeExternalAccountInput {
  bankName: string;
  accountOwnerName: string;
  accountNumber: string;
  routingNumber: string;
  checkingOrSavings: 'checking' | 'savings';
  address: {
    streetLine1: string;
    streetLine2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
}

/** Where Bridge pays out NxPay's developer fees (US bank account, USD only). */
export class BridgeDeveloperApi {
  constructor(private readonly client: BridgeClient) {}

  getFeeExternalAccount() {
    return this.client.get<FeeExternalAccount>('/developer/fee_external_account');
  }

  configureFeeExternalAccount(input: ConfigureFeeExternalAccountInput, idempotencyKey: string) {
    return this.client.post<FeeExternalAccount>(
      '/developer/fee_external_account',
      {
        currency: 'usd',
        account_type: 'us',
        bank_name: input.bankName,
        account_owner_name: input.accountOwnerName,
        account: {
          account_number: input.accountNumber,
          routing_number: input.routingNumber,
          checking_or_savings: input.checkingOrSavings,
        },
        address: {
          street_line_1: input.address.streetLine1,
          street_line_2: input.address.streetLine2,
          city: input.address.city,
          state: input.address.state,
          postal_code: input.address.postalCode,
          country: input.address.country,
        },
      },
      { idempotencyKey }
    );
  }
}
