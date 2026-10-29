/**
 * Master key rotation: re-wraps every wallet data key that isn't on
 * WALLET_MASTER_KEY_CURRENT. Wallet ciphertexts are left untouched.
 *
 *   1. add the new version to the master key file and set WALLET_MASTER_KEY_CURRENT
 *   2. npm run keys:rewrap
 *   3. remove the old version once this reports 0 remaining
 */
import 'reflect-metadata';
import '#src/env.js';

import { Container } from 'typedi';
import { and, not } from '@prisma/orm-postgres/orm-client';

import { PrismaService } from '#src/service/prisma.js';
import { KeyVault, walletKeyAad } from '#src/service/keyVault.js';

const BATCH = 100;

async function main() {
  const prisma = Container.get(PrismaService);
  const vault = Container.get(KeyVault);
  await vault.selfCheck();
  const current = vault.currentVersion;

  let rewrapped = 0;
  let failed = 0;
  let lastId = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const rows = await prisma.orm.WalletKey.where((k) =>
      and(not(k.masterKeyVersion.eq(current)), k.id.gt(lastId))
    )
      .orderBy((k) => k.id.asc())
      .limit(BATCH)
      .all();
    if (rows.length === 0) break;

    for (const row of rows) {
      lastId = row.id;
      const wallet = await prisma.orm.Wallet.where({ id: row.walletId }).first();
      if (!wallet) continue;
      const customer = await prisma.orm.Customer.where({ id: wallet.customerId }).first();
      if (!customer) continue;
      try {
        const next = vault.rewrap(row, walletKeyAad(wallet, customer));
        await prisma.orm.WalletKey.where({
          id: row.id,
          masterKeyVersion: row.masterKeyVersion,
        }).update(next);
        rewrapped++;
      } catch (error) {
        failed++;
        console.error(`[keys:rewrap] wallet key ${row.id}: ${(error as Error).message}`);
      }
    }
  }

  const { remaining } = await prisma.orm.WalletKey.where((k) =>
    not(k.masterKeyVersion.eq(current))
  ).aggregate((a) => ({ remaining: a.count() }));
  console.info(
    `[keys:rewrap] re-wrapped ${rewrapped}, failed ${failed}, remaining on old versions ${remaining}`
  );
  await prisma.close();
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[keys:rewrap] failed', error);
  process.exit(1);
});
