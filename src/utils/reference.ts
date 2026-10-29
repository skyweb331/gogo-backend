import crypto from 'node:crypto';

/** Crockford base32: no I, L, O or U, so codes survive being read out or retyped. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Customer-facing reference such as `NXP-7K3M9QX2` (32^8 combinations). The column is
 * unique; a collision fails the insert and the caller's retry draws a new code.
 */
export const generateReference = (prefix: 'NXP' | 'SUP') => {
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (const byte of bytes) code += ALPHABET[byte & 31];
  return `${prefix}-${code}`;
};
