/**
 * Removes `legacyId`.
 *
 * Keys sealed before the UUID switch only open with the old integer ids. Each one is
 * decrypted with that binding, checked against the wallet address, and sealed again
 * under the UUID binding. The private key bytes are unchanged. Columns are dropped
 * only after every key passes, and a failed row is restored to the ciphertext it had.
 *
 * Stop the API first, then:
 *   npm run legacy:drop
 *   npm run db:migrate
 *
 * Refuses to change anything while a payout is in flight or waiting to retry.
 */
import 'reflect-metadata';
import '#src/env.js';

import { Container } from 'typedi';
import { and, or } from '@prisma/orm-postgres/orm-client';

import { TransactionState } from '#src/graphql/enum.js';
import { AppSettingService } from '#src/entity/appSetting/appSetting.service.js';
import { deriveAddress } from '#src/entity/wallet/wallet.keygen.js';
import { PrismaService, type WalletKeyRow } from '#src/service/prisma.js';
import { KeyVault, walletKeyAad } from '#src/service/keyVault.js';

const RETIRED = 'legacy-ids-retired';

const TABLES = [
  'users',
  'customers',
  'wallets',
  'transactions',
  'fee_schedules',
  'support_tickets',
  'webhook_events',
] as const;

type Link = {
  walletId: string;
  address: string;
  customerId: string;
  walletLegacyId: number | null;
  customerLegacyId: number | null;
};

const legacyAad = (walletLegacyId: number, customerLegacyId: number) =>
  `customer-wallet-key|${walletLegacyId}|${customerLegacyId}`;

const sqlText = (text: string): TemplateStringsArray => {
  const chunks = [text] as unknown as TemplateStringsArray;
  Object.defineProperty(chunks, 'raw', { value: [text] });
  return chunks;
};

async function flag(prisma: PrismaService, text: string): Promise<boolean> {
  const plan = prisma.client.raw
    .sql(sqlText(text))
    .returnsRow({ ok: 'pg/bool@1' } as never)
    .build();
  const [row] = await prisma.query<{ ok: boolean }>(plan);
  return !!row?.ok;
}

async function execute(prisma: PrismaService, text: string) {
  const plan = prisma.client.raw.sql(sqlText(text)).affectedCount().build();
  await prisma.query(plan);
}

function backupOf(row: WalletKeyRow) {
  return {
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.authTag,
    wrappedDataKey: row.wrappedDataKey,
    dataKeyIv: row.dataKeyIv,
    dataKeyAuthTag: row.dataKeyAuthTag,
    masterKeyVersion: row.masterKeyVersion,
  };
}

async function openMatching(vault: KeyVault, row: WalletKeyRow, aad: string, address: string) {
  const secret = vault.open(row, aad);
  try {
    if (deriveAddress(row.keyFormat, secret) !== address) {
      throw new Error(`wallet ${row.walletId} key does not derive its address`);
    }
    return secret;
  } catch (error) {
    secret.fill(0);
    throw error;
  }
}

async function main() {
  const prisma = Container.get(PrismaService);
  const vault = Container.get(KeyVault);
  const settings = Container.get(AppSettingService);
  await vault.selfCheck();

  const uuidIds = await flag(
    prisma,
    `SELECT data_type = 'uuid' AS ok FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id'`
  );
  if (!uuidIds) {
    console.error('[legacy:drop] ids are still integers. Run npm run db:migrate first.');
    process.exitCode = 1;
    await prisma.close();
    return;
  }

  const hasColumn = await flag(
    prisma,
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'wallets' AND column_name = 'legacyId'
     ) AS ok`
  );
  if (!hasColumn) {
    console.info('[legacy:drop] legacyId is already gone');
    await prisma.close();
    return;
  }

  const blocking = await prisma.orm.Transaction.where((t) =>
    or(
      t.state.in([TransactionState.PayoutPending, TransactionState.PayoutSubmitted]),
      and(t.state.eq(TransactionState.PayoutFailed), t.nextRetryAt.isNotNull())
    )
  )
    .select('reference', 'state')
    .limit(20)
    .all();
  if (blocking.length) {
    console.error(
      `[legacy:drop] ${blocking.length} payout(s) still in flight or waiting to retry: ${blocking
        .map((t) => `${t.reference} ${t.state}`)
        .join(', ')}. Let them finish, stop the API, and run this again.`
    );
    process.exitCode = 1;
    await prisma.close();
    return;
  }

  const plan = prisma.client.raw
    .sql`SELECT w.id AS "walletId", w.address, w."customerId" AS "customerId",
           w."legacyId" AS "walletLegacyId", c."legacyId" AS "customerLegacyId"
    FROM "wallets" AS w
    JOIN "customers" AS c ON c.id = w."customerId"
    WHERE EXISTS (SELECT 1 FROM "wallet_keys" AS k WHERE k."walletId" = w.id)`
    .returnsRow({
      walletId: 'pg/uuid@1',
      address: 'pg/text@1',
      customerId: 'pg/uuid@1',
      walletLegacyId: { codecId: 'pg/int4@1', nullable: true },
      customerLegacyId: { codecId: 'pg/int4@1', nullable: true },
    } as never)
    .build();
  const links = await prisma.query<Link>(plan);
  const byWallet = new Map(links.map((link) => [link.walletId, link]));

  let rebound = 0;
  let already = 0;
  let failed = 0;

  for (const row of await prisma.orm.WalletKey.orderBy((k) => k.id.asc()).all()) {
    const link = byWallet.get(row.walletId);
    if (!link) {
      failed++;
      console.error(`[legacy:drop] wallet key ${row.id} has no wallet`);
      continue;
    }
    const next = walletKeyAad(link.walletId, link.customerId);
    try {
      const current = await openMatching(vault, row, next, link.address);
      current.fill(0);
      already++;
      continue;
    } catch {
      // Not sealed under the UUID binding yet.
    }

    if (link.walletLegacyId === null || link.customerLegacyId === null) {
      failed++;
      console.error(`[legacy:drop] wallet ${row.walletId} has no integer binding and did not open`);
      continue;
    }

    const previous = backupOf(row);
    let secret: Buffer | null = null;
    try {
      secret = await openMatching(
        vault,
        row,
        legacyAad(link.walletLegacyId, link.customerLegacyId),
        link.address
      );
      const sealed = vault.seal(secret, next);
      await prisma.orm.WalletKey.where({ id: row.id }).update(sealed);
      const stored = await prisma.orm.WalletKey.where({ id: row.id }).first();
      if (!stored) throw new Error(`wallet key ${row.id} disappeared`);
      const check = await openMatching(vault, stored, next, link.address);
      check.fill(0);
      rebound++;
    } catch (error) {
      failed++;
      console.error(`[legacy:drop] wallet ${row.walletId}: ${(error as Error).message}`);
      await prisma.orm.WalletKey.where({ id: row.id }).update(previous);
    } finally {
      secret?.fill(0);
    }
  }

  console.info(`[legacy:drop] re-sealed ${rebound}, already on UUIDs ${already}, failed ${failed}`);
  if (failed) {
    console.error('[legacy:drop] legacyId was kept because a key did not verify');
    process.exitCode = 1;
    await prisma.close();
    return;
  }

  await settings.set(RETIRED, true);
  await prisma.transaction(async () => {
    for (const table of TABLES) {
      await execute(
        prisma,
        `ALTER TABLE "public"."${table}" DROP CONSTRAINT IF EXISTS "${table}_legacyId_key"`
      );
      await execute(prisma, `ALTER TABLE "public"."${table}" DROP COLUMN IF EXISTS "legacyId"`);
    }
  });
  console.info('[legacy:drop] dropped legacyId. Run npm run db:migrate, then start the API.');
  await prisma.close();
}

main().catch((error) => {
  console.error('[legacy:drop] failed', error);
  process.exit(1);
});
