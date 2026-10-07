import crypto from 'node:crypto';
import bs58 from 'bs58';
import { bytesToHex } from 'viem';
import { privateKeyToAddress } from 'viem/accounts';

import { Chain } from '#src/graphql/enum.js';

export type KeyFormat = 'evm-hex' | 'solana-base58-64';

export interface GeneratedKey {
  chain: Chain;
  address: string;
  keyFormat: KeyFormat;
  /** Raw key material: 32-byte secp256k1 key (Base) or 64-byte seed+public key (Solana). Zero after use. */
  secret: Buffer;
}

const SECP256K1_N = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');

function generateEvmKey(): GeneratedKey {
  for (;;) {
    const secret = crypto.randomBytes(32);
    const scalar = BigInt(`0x${secret.toString('hex')}`);
    if (scalar === 0n || scalar >= SECP256K1_N) {
      secret.fill(0);
      continue;
    }
    const address = privateKeyToAddress(bytesToHex(secret));
    return { chain: Chain.base, address, keyFormat: 'evm-hex', secret };
  }
}

function generateSolanaKey(): GeneratedKey {
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const jwk = privateKey.export({ format: 'jwk' });
  const seed = Buffer.from(jwk.d!, 'base64url');
  const publicKey = Buffer.from(jwk.x!, 'base64url');
  const secret = Buffer.concat([seed, publicKey]);
  seed.fill(0);
  return {
    chain: Chain.solana,
    address: bs58.encode(publicKey),
    keyFormat: 'solana-base58-64',
    secret,
  };
}

export function generateWalletKey(chain: Chain): GeneratedKey {
  if (chain === Chain.base) return generateEvmKey();
  if (chain === Chain.solana) return generateSolanaKey();
  throw new Error(`Unsupported chain ${chain}`);
}

/**
 * Wallet-app import format: `0x` hex for Base (MetaMask, Coinbase Wallet, Rabby),
 * base58 of the 64-byte keypair for Solana (Phantom, Solflare).
 */
export function formatExportKey(keyFormat: KeyFormat | string, secret: Buffer): string {
  if (keyFormat === 'evm-hex') return bytesToHex(secret);
  if (keyFormat === 'solana-base58-64') return bs58.encode(secret);
  throw new Error(`Unknown key format ${keyFormat}`);
}

/** Checks that decrypted key material still derives the wallet's address. */
export function deriveAddress(keyFormat: KeyFormat | string, secret: Buffer): string {
  if (keyFormat === 'evm-hex') return privateKeyToAddress(bytesToHex(secret));
  if (keyFormat === 'solana-base58-64') return bs58.encode(secret.subarray(32, 64));
  throw new Error(`Unknown key format ${keyFormat}`);
}
