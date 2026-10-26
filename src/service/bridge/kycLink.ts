import anyAscii from 'any-ascii';

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

/** Bridge accepts printable ASCII and Latin-1 letters; anything else needs a transliteration. */
const NON_LATIN1 = /[^\x20-\x7E\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]/;

const transliterate = (value: string) => anyAscii(value).replace(/\s+/g, ' ').trim().slice(0, 256);

function transliteratedName(fullName: string, type: CreateKycLinkInput['type']) {
  const name = fullName.trim();
  if (!NON_LATIN1.test(name)) return {};
  if (type === 'business') {
    const legal = transliterate(name);
    return legal ? { transliterated_business_legal_name: legal } : {};
  }
  const parts = name.split(/\s+/).map(transliterate);
  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : first;
  const middle = parts.slice(1, -1).join(' ');
  if (!first || !last) return {};
  return {
    transliterated_first_name: first,
    ...(middle && { transliterated_middle_name: middle }),
    transliterated_last_name: last,
  };
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
        ...transliteratedName(input.fullName, input.type),
      },
      { idempotencyKey: input.idempotencyKey }
    );
  }

  get(kycLinkId: string) {
    return this.client.get<BridgeKycLink>(`/kyc_links/${encodeURIComponent(kycLinkId)}`);
  }
}
