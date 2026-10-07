import crypto from 'node:crypto';

export const WEBHOOK_TOLERANCE_MS = 10 * 60 * 1000;

export type SignatureResult =
  | { ok: true; timestamp: number }
  | {
      ok: false;
      reason:
        'missing_header' | 'malformed_header' | 'stale' | 'invalid_signature' | 'no_public_key';
    };

let cachedKey: { pem: string; key: crypto.KeyObject } | undefined;

function publicKey(pem: string) {
  if (cachedKey?.pem === pem) return cachedKey.key;
  const key = crypto.createPublicKey(pem.replace(/\\n/g, '\n'));
  cachedKey = { pem, key };
  return key;
}

/**
 * Bridge header: `X-Webhook-Signature: t=<ms>,v0=<base64>`.
 * The signature is RSA-SHA256 over SHA256(`${t}.${rawBody}`).
 */
export function verifyBridgeSignature(
  rawBody: Buffer,
  header: string | undefined,
  publicKeyPem: string,
  now = Date.now()
): SignatureResult {
  if (!publicKeyPem) return { ok: false, reason: 'no_public_key' };
  if (!header) return { ok: false, reason: 'missing_header' };

  const parts = new Map<string, string>();
  for (const segment of header.split(',')) {
    const index = segment.indexOf('=');
    if (index > 0) parts.set(segment.slice(0, index).trim(), segment.slice(index + 1).trim());
  }
  const t = parts.get('t');
  const signature = parts.get('v0');
  if (!t || !signature || !/^\d+$/.test(t)) return { ok: false, reason: 'malformed_header' };

  const timestamp = Number(t);
  if (Math.abs(now - timestamp) > WEBHOOK_TOLERANCE_MS) return { ok: false, reason: 'stale' };

  const digest = crypto
    .createHash('sha256')
    .update(Buffer.concat([Buffer.from(`${t}.`), rawBody]))
    .digest();

  let valid = false;
  try {
    valid = crypto.verify(
      'sha256',
      digest,
      publicKey(publicKeyPem),
      Buffer.from(signature, 'base64')
    );
  } catch {
    valid = false;
  }
  return valid ? { ok: true, timestamp } : { ok: false, reason: 'invalid_signature' };
}
