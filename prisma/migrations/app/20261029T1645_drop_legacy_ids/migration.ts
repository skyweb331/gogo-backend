#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/7d0741b1cb2086c077d35861408d08b1ebe61ae6e84a186961a9c37efe5bd043/contract';
import startContract from '../../snapshots/7d0741b1cb2086c077d35861408d08b1ebe61ae6e84a186961a9c37efe5bd043/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/0d7c10eeac2c6ff2294dd684fffd6160a290b48b464939592db20138febda647/contract';
import endContract from '../../snapshots/0d7c10eeac2c6ff2294dd684fffd6160a290b48b464939592db20138febda647/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

/**
 * Drops `legacyId` after `npm run legacy:drop` has re-sealed wallet keys under their UUIDs.
 * The precheck refuses to run while a stored key still depends on the integer binding.
 */

const TABLES = [
  'users',
  'customers',
  'wallets',
  'transactions',
  'fee_schedules',
  'support_tickets',
  'webhook_events',
] as const;

const columnGone = (table: string) => ({
  description: `${table}.legacyId is gone`,
  sql: `SELECT NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'legacyId'
  ) AS "result"`,
  params: [table],
});

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: 'data.legacy_ids.drop',
        label: 'Drop legacyId after wallet keys are bound to UUIDs',
        operationClass: 'destructive',
        target: { id: 'postgres' },
        precheck: [
          {
            description: 'wallet keys no longer depend on legacyId (run npm run legacy:drop first)',
            sql: `SELECT (
              NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'wallets' AND column_name = 'legacyId'
              )
              OR NOT EXISTS (SELECT 1 FROM "wallet_keys")
              OR EXISTS (
                SELECT 1 FROM "app_settings"
                WHERE "key" = 'legacy-ids-retired' AND "value" = 'true'::jsonb
              )
            ) AS "result"`,
          },
        ],
        execute: TABLES.flatMap((table) => [
          {
            description: `drop unique ${table}_legacyId_key`,
            sql: `ALTER TABLE "public".${JSON.stringify(table)} DROP CONSTRAINT IF EXISTS ${JSON.stringify(`${table}_legacyId_key`)}`,
          },
          {
            description: `drop ${table}.legacyId`,
            sql: `ALTER TABLE "public".${JSON.stringify(table)} DROP COLUMN IF EXISTS "legacyId"`,
          },
        ]),
        postcheck: TABLES.map((table) => columnGone(table)),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
