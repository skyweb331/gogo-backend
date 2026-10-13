import type { BridgeClient } from './client.js';
import type { BridgeKycLink } from './types.js';

export interface CreateKycLinkInput {
  fullName: string;
  email: string;
  type: 'individual' | 'business';
  /** `base` for USD; add `sepa` for EUR accounts */
  endorsements: string[];
  redirectUri: string;
  idempotencyKey: string;
}

/**
 * Bridge-hosted KYC/KYB + ToS. NxPay sends only name, email, type, endorsements and the
 * redirect; all identity data is collected by Bridge.
 */
export class BridgeKycLinksApi {
  constructor(private readonly client: BridgeClient) {}

  create(input: CreateKycLinkInput) {
    return this.client.post<BridgeKycLink>(
      '/kyc_links',
      {
        full_name: input.fullName,
        email: input.email,
        type: input.type,
        endorsements: input.endorsements,
        redirect_uri: input.redirectUri,
      },
      { idempotencyKey: input.idempotencyKey }
    );
  }

  get(kycLinkId: string) {
    return this.client.get<BridgeKycLink>(`/kyc_links/${encodeURIComponent(kycLinkId)}`);
  }
}
