#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/74ee075d25d7337b829ed869cfd62fe6196f873c9a9c4e8bbb5a309b0d6e2e2e/contract';
import startContract from '../../snapshots/74ee075d25d7337b829ed869cfd62fe6196f873c9a9c4e8bbb5a309b0d6e2e2e/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/7d0741b1cb2086c077d35861408d08b1ebe61ae6e84a186961a9c37efe5bd043/contract';
import endContract from '../../snapshots/7d0741b1cb2086c077d35861408d08b1ebe61ae6e84a186961a9c37efe5bd043/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

/**
 * Integer ids -> UUIDv7, converting existing rows in place.
 *
 * - Every row gets a UUIDv7 built from its `createdAt` (old id in the sequence bits), so
 *   ordering by id still follows creation order.
 * - Foreign keys and the integer user/wallet reference columns are remapped through the
 *   old ids, then the columns are retyped with `USING`, which keeps constraint and index names.
 * - Tables known outside the database by their old id keep it in `legacyId`.
 * - Audit `entityId`/`actorId` and ids stored inside JSON are remapped.
 * - Transactions and support tickets get a random customer-facing reference.
 */

const TABLES = [
  'users',
  'customers',
  'one_time_codes',
  'wallets',
  'wallet_keys',
  'key_vault_canaries',
  'custodial_wallets',
  'virtual_accounts',
  'transactions',
  'transaction_events',
  'monthly_volumes',
  'fee_schedules',
  'fee_tiers',
  'support_tickets',
  'support_messages',
  'audit_logs',
  'webhook_events',
] as const;
type Table = (typeof TABLES)[number];

const LEGACY_TABLES: Table[] = [
  'users',
  'customers',
  'wallets',
  'transactions',
  'fee_schedules',
  'support_tickets',
  'webhook_events',
];

type Ref = { table: Table; column: string; target: Table; fk?: string; onDelete?: string };

const REFS: Ref[] = [
  { table: 'customers', column: 'userId', target: 'users', fk: 'customers_userId_fkey', onDelete: 'CASCADE' },
  { table: 'customers', column: 'payoutWalletId', target: 'wallets' },
  { table: 'one_time_codes', column: 'userId', target: 'users', fk: 'one_time_codes_userId_fkey', onDelete: 'CASCADE' },
  { table: 'wallets', column: 'customerId', target: 'customers', fk: 'wallets_customerId_fkey', onDelete: 'CASCADE' },
  { table: 'wallet_keys', column: 'walletId', target: 'wallets', fk: 'wallet_keys_walletId_fkey', onDelete: 'CASCADE' },
  { table: 'custodial_wallets', column: 'customerId', target: 'customers', fk: 'custodial_wallets_customerId_fkey', onDelete: 'CASCADE' },
  { table: 'virtual_accounts', column: 'customerId', target: 'customers', fk: 'virtual_accounts_customerId_fkey', onDelete: 'CASCADE' },
  { table: 'virtual_accounts', column: 'custodialWalletId', target: 'custodial_wallets', fk: 'virtual_accounts_custodialWalletId_fkey', onDelete: 'RESTRICT' },
  { table: 'transactions', column: 'customerId', target: 'customers', fk: 'transactions_customerId_fkey', onDelete: 'RESTRICT' },
  { table: 'transactions', column: 'virtualAccountId', target: 'virtual_accounts', fk: 'transactions_virtualAccountId_fkey', onDelete: 'SET NULL' },
  { table: 'transactions', column: 'feeScheduleId', target: 'fee_schedules', fk: 'transactions_feeScheduleId_fkey', onDelete: 'RESTRICT' },
  { table: 'transaction_events', column: 'transactionId', target: 'transactions', fk: 'transaction_events_transactionId_fkey', onDelete: 'CASCADE' },
  { table: 'monthly_volumes', column: 'customerId', target: 'customers', fk: 'monthly_volumes_customerId_fkey', onDelete: 'CASCADE' },
  { table: 'fee_schedules', column: 'createdById', target: 'users' },
  { table: 'fee_schedules', column: 'publishedById', target: 'users' },
  { table: 'fee_tiers', column: 'feeScheduleId', target: 'fee_schedules', fk: 'fee_tiers_feeScheduleId_fkey', onDelete: 'CASCADE' },
  { table: 'support_tickets', column: 'customerId', target: 'customers', fk: 'support_tickets_customerId_fkey', onDelete: 'CASCADE' },
  { table: 'support_tickets', column: 'assigneeId', target: 'users' },
  { table: 'support_messages', column: 'ticketId', target: 'support_tickets', fk: 'support_messages_ticketId_fkey', onDelete: 'CASCADE' },
  { table: 'support_messages', column: 'authorId', target: 'users', fk: 'support_messages_authorId_fkey', onDelete: 'RESTRICT' },
  { table: 'audit_logs', column: 'actorId', target: 'users' },
];

const AUDIT_ENTITIES: Record<string, Table> = {
  User: 'users',
  Customer: 'customers',
  Wallet: 'wallets',
  Transaction: 'transactions',
  VirtualAccount: 'virtual_accounts',
  FeeSchedule: 'fee_schedules',
  SupportTicket: 'support_tickets',
  WebhookEvent: 'webhook_events',
};

/** [table, jsonb column, key, table the id points to] */
const JSON_REFS: [Table, string, string, Table][] = [
  ['transactions', 'feeBreakdown', 'scheduleId', 'fee_schedules'],
  ['transactions', 'destinationWalletSnapshot', 'walletId', 'wallets'],
  ['transaction_events', 'payload', 'scheduleId', 'fee_schedules'],
  ['transaction_events', 'payload', 'by', 'users'],
  ['one_time_codes', 'meta', 'walletId', 'wallets'],
];

const q = (name: string) => `"${name}"`;
const t = (table: string) => `"public".${q(table)}`;

function statements() {
  const steps: { description: string; sql: string }[] = [];
  const add = (description: string, sql: string) => steps.push({ description, sql });

  add(
    'create temporary UUIDv7 helper',
    `CREATE FUNCTION "public"."nxpay_tmp_uuid7"(ts timestamptz, seq bigint) RETURNS uuid
LANGUAGE sql VOLATILE AS $$
  SELECT (lpad(to_hex(floor(extract(epoch FROM ts) * 1000)::bigint), 12, '0')
    || '7' || lpad(to_hex(seq % 4096), 3, '0')
    || to_hex(8 + floor(random() * 4)::int)
    || substr(replace(gen_random_uuid()::text, '-', ''), 1, 15))::uuid
$$`
  );
  add(
    'create temporary reference helper',
    `CREATE FUNCTION "public"."nxpay_tmp_reference"(prefix text) RETURNS text
LANGUAGE sql VOLATILE AS $$
  SELECT prefix || string_agg(substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', get_byte(b, i) % 32 + 1, 1), '' ORDER BY i)
  FROM (SELECT uuid_send(gen_random_uuid()) AS b) r, unnest(ARRAY[0, 1, 2, 3, 4, 5, 10, 11]) AS i
$$`
  );

  for (const table of TABLES) {
    add(`add new id to ${table}`, `ALTER TABLE ${t(table)} ADD COLUMN "_uuid" uuid`);
  }
  for (const table of TABLES) {
    if (table === 'fee_tiers') {
      add(
        'fill new ids of fee_tiers',
        `UPDATE ${t(table)} AS x SET "_uuid" = "public"."nxpay_tmp_uuid7"(s."createdAt", x."id")
FROM ${t('fee_schedules')} AS s WHERE s."id" = x."feeScheduleId"`
      );
    } else {
      add(
        `fill new ids of ${table}`,
        `UPDATE ${t(table)} SET "_uuid" = "public"."nxpay_tmp_uuid7"("createdAt", "id")`
      );
    }
  }

  for (const table of LEGACY_TABLES) {
    add(`keep old ids of ${table}`, `ALTER TABLE ${t(table)} ADD COLUMN "legacyId" int4`);
    add(`copy old ids of ${table}`, `UPDATE ${t(table)} SET "legacyId" = "id"`);
  }

  for (const [prefix, table] of [
    ['NXP-', 'transactions'],
    ['SUP-', 'support_tickets'],
  ] as const) {
    add(`add reference to ${table}`, `ALTER TABLE ${t(table)} ADD COLUMN "reference" text`);
    add(
      `fill references of ${table}`,
      `UPDATE ${t(table)} SET "reference" = "public"."nxpay_tmp_reference"('${prefix}')`
    );
    add(
      `require references of ${table}`,
      `ALTER TABLE ${t(table)} ALTER COLUMN "reference" SET NOT NULL`
    );
  }

  for (const [entity, table] of Object.entries(AUDIT_ENTITIES)) {
    add(
      `remap audit entityId for ${entity}`,
      `UPDATE ${t('audit_logs')} AS a SET "entityId" = x."_uuid"::text
FROM ${t(table)} AS x WHERE a."entity" = '${entity}' AND a."entityId" = x."id"::text`
    );
  }

  for (const [table, column, key, target] of JSON_REFS) {
    add(
      `remap ${table}.${column}.${key}`,
      `UPDATE ${t(table)} AS x SET ${q(column)} = jsonb_set(x.${q(column)}, '{${key}}', to_jsonb(y."_uuid"::text))
FROM ${t(target)} AS y
WHERE jsonb_typeof(x.${q(column)}) = 'object' AND jsonb_typeof(x.${q(column)} -> '${key}') = 'number'
  AND y."id" = (x.${q(column)} ->> '${key}')::int`
    );
  }

  for (const ref of REFS) {
    const tmp = q(`_${ref.column}`);
    add(`add new ${ref.table}.${ref.column}`, `ALTER TABLE ${t(ref.table)} ADD COLUMN ${tmp} uuid`);
    add(
      `fill new ${ref.table}.${ref.column}`,
      `UPDATE ${t(ref.table)} AS x SET ${tmp} = y."_uuid" FROM ${t(ref.target)} AS y WHERE y."id" = x.${q(ref.column)}`
    );
  }

  for (const ref of REFS) {
    if (ref.fk) add(`drop ${ref.fk}`, `ALTER TABLE ${t(ref.table)} DROP CONSTRAINT ${q(ref.fk)}`);
  }

  for (const ref of REFS) {
    const tmp = q(`_${ref.column}`);
    add(
      `retype ${ref.table}.${ref.column}`,
      `ALTER TABLE ${t(ref.table)} ALTER COLUMN ${q(ref.column)} TYPE uuid USING ${tmp}`
    );
    add(`drop new ${ref.table}.${ref.column}`, `ALTER TABLE ${t(ref.table)} DROP COLUMN ${tmp}`);
  }

  for (const table of TABLES) {
    add(`drop id default of ${table}`, `ALTER TABLE ${t(table)} ALTER COLUMN "id" DROP DEFAULT`);
    add(`retype ${table}.id`, `ALTER TABLE ${t(table)} ALTER COLUMN "id" TYPE uuid USING "_uuid"`);
    add(`drop new id of ${table}`, `ALTER TABLE ${t(table)} DROP COLUMN "_uuid"`);
    add(`drop id sequence of ${table}`, `DROP SEQUENCE IF EXISTS "public".${q(`${table}_id_seq`)}`);
  }

  for (const ref of REFS) {
    if (!ref.fk) continue;
    add(
      `add ${ref.fk}`,
      `ALTER TABLE ${t(ref.table)}
ADD CONSTRAINT ${q(ref.fk)}
FOREIGN KEY (${q(ref.column)})
REFERENCES ${t(ref.target)} ("id")
ON DELETE ${ref.onDelete}`
    );
  }

  add('drop temporary UUIDv7 helper', `DROP FUNCTION "public"."nxpay_tmp_uuid7"(timestamptz, bigint)`);
  add('drop temporary reference helper', `DROP FUNCTION "public"."nxpay_tmp_reference"(text)`);
  return steps;
}

const idType = (table: Table, type: string) => ({
  description: `${table}.id is ${type}`,
  sql: `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'id' AND data_type = $2) AS "result"`,
  params: [table, type],
});

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: 'data.uuid_ids.convert',
        label: 'Convert integer ids to UUIDv7, keeping old ids in legacyId',
        operationClass: 'destructive',
        target: { id: 'postgres' },
        precheck: TABLES.map((table) => idType(table, 'integer')),
        execute: statements(),
        postcheck: TABLES.map((table) => idType(table, 'uuid')),
      }),
      this.addUnique({
        schema: 'public',
        table: 'customers',
        constraint: 'customers_legacyId_key',
        columns: ['legacyId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'fee_schedules',
        constraint: 'fee_schedules_legacyId_key',
        columns: ['legacyId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'support_tickets',
        constraint: 'support_tickets_legacyId_key',
        columns: ['legacyId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'support_tickets',
        constraint: 'support_tickets_reference_key',
        columns: ['reference'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'transactions',
        constraint: 'transactions_legacyId_key',
        columns: ['legacyId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'transactions',
        constraint: 'transactions_reference_key',
        columns: ['reference'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'users',
        constraint: 'users_legacyId_key',
        columns: ['legacyId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'wallets',
        constraint: 'wallets_legacyId_key',
        columns: ['legacyId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'webhook_events',
        constraint: 'webhook_events_legacyId_key',
        columns: ['legacyId'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
