import crypto from 'node:crypto';
import fs from 'node:fs';
import { Service } from 'typedi';

import { config, isProduction } from '#src/config.js';
import { PrismaService } from '#src/service/prisma.js';

const ALGORITHM = 'aes-256-gcm';
const CANARY_PLAINTEXT = 'nxpay-keyvault-canary';

export interface SealedSecret {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  authTag: Uint8Array;
  wrappedDataKey: Uint8Array;
  dataKeyIv: Uint8Array;
  dataKeyAuthTag: Uint8Array;
  masterKeyVersion: string;
}

export type WrappedDataKey = Pick<
  SealedSecret,
  'wrappedDataKey' | 'dataKeyIv' | 'dataKeyAuthTag' | 'masterKeyVersion'
>;

type AadOwner = { id: string; legacyId: number | null };

/** Keys sealed before the UUID switch stay bound to the integer ids they were sealed with. */
export const walletKeyAad = (wallet: AadOwner, customer: AadOwner) => {
  if (wallet.legacyId === null) return `customer-wallet-key|${wallet.id}|${customer.id}`;
  if (customer.legacyId === null) throw new Error(`Wallet ${wallet.id} has no legacy customer id`);
  return `customer-wallet-key|${wallet.legacyId}|${customer.legacyId}`;
};
const canaryAad = (version: string) => `keyvault-canary|${version}`;

function parseMasterKeys(source: string, origin: string): Map<string, Buffer> {
  const keys = new Map<string, Buffer>();
  for (const entry of source.split(/[\n,]/)) {
    const line = entry.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf(':');
    if (index <= 0) throw new Error(`[keyvault] malformed master key entry in ${origin}`);
    const version = line.slice(0, index).trim();
    const key = Buffer.from(line.slice(index + 1).trim(), 'base64');
    if (key.length !== 32)
      throw new Error(`[keyvault] master key ${version} in ${origin} must be 32 bytes`);
    if (keys.has(version)) throw new Error(`[keyvault] duplicate master key version ${version}`);
    keys.set(version, key);
  }
  return keys;
}

function loadMasterKeys(): Map<string, Buffer> {
  if (config.WALLET_MASTER_KEYS_FILE) {
    return parseMasterKeys(
      fs.readFileSync(config.WALLET_MASTER_KEYS_FILE, 'utf8'),
      'WALLET_MASTER_KEYS_FILE'
    );
  }
  if (isProduction) {
    throw new Error(
      '[keyvault] WALLET_MASTER_KEYS_FILE is required in production (inline keys are refused)'
    );
  }
  return parseMasterKeys(config.WALLET_MASTER_KEYS, 'WALLET_MASTER_KEYS');
}

function encrypt(key: Buffer, plaintext: Buffer, aad: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

function decrypt(
  key: Buffer,
  ciphertext: Uint8Array,
  iv: Uint8Array,
  authTag: Uint8Array,
  aad: string
) {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(authTag));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext)), decipher.final()]);
}

/**
 * Envelope encryption for generated wallet keys: a fresh data key per secret
 * (AES-256-GCM), wrapped by a versioned app master key. The AAD binds every
 * ciphertext to its wallet and customer.
 */
@Service()
export class KeyVault {
  private keys?: Map<string, Buffer>;

  constructor(private readonly prisma: PrismaService) {}

  private get masterKeys() {
    if (!this.keys) this.keys = loadMasterKeys();
    return this.keys;
  }

  get currentVersion() {
    return config.WALLET_MASTER_KEY_CURRENT;
  }

  private masterKey(version: string) {
    const key = this.masterKeys.get(version);
    if (!key) throw new Error(`[keyvault] master key ${version} is not configured`);
    return key;
  }

  seal(secret: Buffer, aad: string): SealedSecret {
    const version = this.currentVersion;
    const master = this.masterKey(version);
    const dataKey = crypto.randomBytes(32);
    try {
      const data = encrypt(dataKey, secret, aad);
      const wrapped = encrypt(master, dataKey, aad);
      return {
        ciphertext: data.ciphertext,
        iv: data.iv,
        authTag: data.authTag,
        wrappedDataKey: wrapped.ciphertext,
        dataKeyIv: wrapped.iv,
        dataKeyAuthTag: wrapped.authTag,
        masterKeyVersion: version,
      };
    } finally {
      dataKey.fill(0);
    }
  }

  /** Returns the plaintext; the caller must `fill(0)` it when done. */
  open(sealed: SealedSecret, aad: string): Buffer {
    const dataKey = decrypt(
      this.masterKey(sealed.masterKeyVersion),
      sealed.wrappedDataKey,
      sealed.dataKeyIv,
      sealed.dataKeyAuthTag,
      aad
    );
    try {
      return decrypt(dataKey, sealed.ciphertext, sealed.iv, sealed.authTag, aad);
    } finally {
      dataKey.fill(0);
    }
  }

  /** Re-wraps only the data key with the current master key (rotation). */
  rewrap(wrapped: WrappedDataKey, aad: string): WrappedDataKey {
    const dataKey = decrypt(
      this.masterKey(wrapped.masterKeyVersion),
      wrapped.wrappedDataKey,
      wrapped.dataKeyIv,
      wrapped.dataKeyAuthTag,
      aad
    );
    try {
      const next = encrypt(this.masterKey(this.currentVersion), dataKey, aad);
      return {
        wrappedDataKey: next.ciphertext,
        dataKeyIv: next.iv,
        dataKeyAuthTag: next.authTag,
        masterKeyVersion: this.currentVersion,
      };
    } finally {
      dataKey.fill(0);
    }
  }

  /**
   * Startup self-check. Refuses to boot when the current key is missing, when a stored
   * canary doesn't decrypt, or when wallet keys reference an unconfigured version.
   * Creates the canary for configured versions that don't have one yet.
   */
  async selfCheck() {
    const keys = this.masterKeys;
    if (!keys.has(this.currentVersion)) {
      throw new Error(
        `[keyvault] WALLET_MASTER_KEY_CURRENT=${this.currentVersion} is not configured`
      );
    }

    const canaries = await this.prisma.orm.KeyVaultCanary.all();
    for (const canary of canaries) {
      const key = keys.get(canary.masterKeyVersion);
      if (!key) continue;
      let plaintext: string;
      try {
        plaintext = this.open(canary, canaryAad(canary.masterKeyVersion)).toString('utf8');
      } catch {
        throw new Error(
          `[keyvault] master key ${canary.masterKeyVersion} does not match its canary (wrong key?)`
        );
      }
      if (plaintext !== CANARY_PLAINTEXT) {
        throw new Error(`[keyvault] canary mismatch for master key ${canary.masterKeyVersion}`);
      }
    }

    const versionsInUse = await this.prisma.orm.WalletKey.select('masterKeyVersion').all();
    const missing = [...new Set(versionsInUse.map((r) => r.masterKeyVersion))].filter(
      (v) => !keys.has(v)
    );
    if (missing.length) {
      throw new Error(
        `[keyvault] wallet keys use unconfigured master key version(s): ${missing.join(', ')}`
      );
    }

    const withCanary = new Set(canaries.map((c) => c.masterKeyVersion));
    for (const version of keys.keys()) {
      if (withCanary.has(version)) continue;
      const master = this.masterKey(version);
      const dataKey = crypto.randomBytes(32);
      try {
        const data = encrypt(dataKey, Buffer.from(CANARY_PLAINTEXT), canaryAad(version));
        const wrapped = encrypt(master, dataKey, canaryAad(version));
        await this.prisma.orm.KeyVaultCanary.create({
          masterKeyVersion: version,
          ciphertext: data.ciphertext,
          iv: data.iv,
          authTag: data.authTag,
          wrappedDataKey: wrapped.ciphertext,
          dataKeyIv: wrapped.iv,
          dataKeyAuthTag: wrapped.authTag,
        });
        console.info(`[keyvault] created canary for master key ${version}`);
      } finally {
        dataKey.fill(0);
      }
    }
  }
}
