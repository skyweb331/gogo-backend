import bs58 from 'bs58';
import { getAddress, isAddress } from 'viem';

import { Chain } from '#src/graphql/enum.js';

/** Returns the canonical address (EIP-55 checksum on Base) or null if invalid. */
export function normalizeAddress(chain: Chain | string, address: string): string | null {
  const value = address.trim();
  if (chain === Chain.base) {
    if (!isAddress(value, { strict: false })) return null;
    const checksummed = getAddress(value);
    return checksummed === '0x0000000000000000000000000000000000000000' ? null : checksummed;
  }
  if (chain === Chain.solana) {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return null;
    try {
      return bs58.decode(value).length === 32 ? value : null;
    } catch {
      return null;
    }
  }
  return null;
}

export const isValidAddress = (chain: Chain | string, address: string) =>
  normalizeAddress(chain, address) !== null;

export const shortAddress = (address: string) =>
  address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
