import { Service } from 'typedi';

import { PrismaService, type WalletRow } from '#src/service/prisma.js';
import { KeyVault, walletKeyAad } from '#src/service/keyVault.js';

import { deriveAddress, formatExportKey, type GeneratedKey } from './wallet.keygen.js';

/**
 * The only code that touches `WalletKey`. It has no GraphQL type, no loader and
 * no resolver access; plaintext keys exist only inside `seal` and `exportKey`.
 */
@Service()
export class WalletKeyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: KeyVault
  ) {}

  private async aad(wallet: Pick<WalletRow, 'id' | 'legacyId' | 'customerId'>) {
    const customer =
      wallet.legacyId === null
        ? { id: wallet.customerId, legacyId: null }
        : await this.prisma.orm.Customer.where({ id: wallet.customerId })
            .select('id', 'legacyId')
            .first();
    if (!customer) throw new Error(`Customer of wallet ${wallet.id} not found`);
    return walletKeyAad(wallet, customer);
  }

  /** Seals and stores the generated key. Run inside the transaction that created the wallet. */
  async store(wallet: Pick<WalletRow, 'id' | 'legacyId' | 'customerId'>, generated: GeneratedKey) {
    const sealed = this.vault.seal(generated.secret, await this.aad(wallet));
    await this.prisma.orm.WalletKey.create({
      walletId: wallet.id,
      keyFormat: generated.keyFormat,
      algorithm: 'aes-256-gcm',
      ...sealed,
    });
  }

  async hasKey(walletId: string) {
    const row = await this.prisma.orm.WalletKey.where({ walletId }).select('id').first();
    return !!row;
  }

  /** Decrypts and formats the key for wallet-app import. Callers audit and rate limit. */
  async exportKey(
    wallet: Pick<WalletRow, 'id' | 'legacyId' | 'customerId' | 'address'>
  ): Promise<string | null> {
    const row = await this.prisma.orm.WalletKey.where({ walletId: wallet.id }).first();
    if (!row) return null;
    const secret = this.vault.open(row, await this.aad(wallet));
    try {
      if (deriveAddress(row.keyFormat, secret) !== wallet.address) {
        throw new Error(`Wallet key ${row.id} does not match wallet ${wallet.id}`);
      }
      return formatExportKey(row.keyFormat, secret);
    } finally {
      secret.fill(0);
    }
  }

  async remove(walletId: string) {
    await this.prisma.orm.WalletKey.where({ walletId }).delete();
  }
}
