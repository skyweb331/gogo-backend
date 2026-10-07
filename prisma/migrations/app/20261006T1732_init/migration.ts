#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/74ee075d25d7337b829ed869cfd62fe6196f873c9a9c4e8bbb5a309b0d6e2e2e/contract';
import endContract from '../../snapshots/74ee075d25d7337b829ed869cfd62fe6196f873c9a9c4e8bbb5a309b0d6e2e2e/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'app_settings',
        columns: [
          col('key', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1' },
          }),
          col('value', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
        ],
        constraints: [primaryKey(['key'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'audit_logs',
        columns: [
          col('action', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('actorId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('actorRole', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('after', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('before', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('entity', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('entityId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('ip', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'custodial_wallets',
        columns: [
          col('address', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('bridgeWalletId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('chain', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('customerId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'custodial_wallets_chain_check_ed6bea37',
            "\"chain\" IN ('base', 'solana')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'customers',
        columns: [
          col('bridgeCustomerId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('country', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('endorsements', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('kycLink', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('kycLinkId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('kycStatus', 'text', {
            notNull: true,
            default: lit('not_started'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('onboardedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('payoutWalletId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('region', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('rejectionReasons', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('Onboarding'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('suspendedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('tosLink', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('tosStatus', 'text', {
            notNull: true,
            default: lit('pending'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('type', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1' },
          }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'customers_status_check_8bb956f2',
            "\"status\" IN ('Onboarding', 'Active', 'Suspended')",
          ),
          checkExpression(
            'customers_type_check_c5ba0656',
            "\"type\" IN ('individual', 'business')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'fee_schedules',
        columns: [
          col('cancelledAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('createdById', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('effectivePeriod', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('notes', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('notifyCustomers', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('publishedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('publishedById', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('Draft'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'fee_schedules_status_check_b068110f',
            "\"status\" IN ('Draft', 'Scheduled', 'Active', 'Superseded', 'Cancelled')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'fee_tiers',
        columns: [
          col('feeScheduleId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('fromInCents', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('position', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('rateBps', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('toInCents', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'key_vault_canaries',
        columns: [
          col('authTag', 'bytea', { notNull: true, codecRef: { codecId: 'pg/bytea@1' } }),
          col('ciphertext', 'bytea', { notNull: true, codecRef: { codecId: 'pg/bytea@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('dataKeyAuthTag', 'bytea', { notNull: true, codecRef: { codecId: 'pg/bytea@1' } }),
          col('dataKeyIv', 'bytea', { notNull: true, codecRef: { codecId: 'pg/bytea@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('iv', 'bytea', { notNull: true, codecRef: { codecId: 'pg/bytea@1' } }),
          col('masterKeyVersion', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('wrappedDataKey', 'bytea', { notNull: true, codecRef: { codecId: 'pg/bytea@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'monthly_volumes',
        columns: [
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('customerId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('feeInCents', 'int8', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/int8@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('periodKey', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('txCount', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1' },
          }),
          col('version', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('volumeInCents', 'int8', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/int8@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'one_time_codes',
        columns: [
          col('attempts', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('codeHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('consumedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('expiresAt', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('meta', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('purpose', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'one_time_codes_purpose_check_4e1d9a7a',
            "\"purpose\" IN ('EmailVerify', 'PasswordReset', 'WalletKeyExport', 'WalletChange')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'support_messages',
        columns: [
          col('authorId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('body', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('isStaff', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('ticketId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'support_tickets',
        columns: [
          col('assigneeId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('customerId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('lastMessageAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('Open'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('subject', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'support_tickets_status_check_f88e88ac',
            "\"status\" IN ('Open', 'Pending', 'Resolved', 'Closed')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'transaction_events',
        columns: [
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('payload', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('source', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('transactionId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'transaction_events_source_check_4cd88e2e',
            "\"source\" IN ('bridge_va', 'bridge_transfer', 'system', 'admin')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'transactions',
        columns: [
          col('attempts', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('bridgeDepositId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('bridgeTransferId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('completedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('creditedAmountInCents', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
          col('creditedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('currency', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('customerId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('destinationWalletSnapshot', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('exchangeFeeInCents', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
          col('failureReason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('feeBreakdown', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('feeInCents', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
          col('feeScheduleId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('fundsReceivedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('fxRate', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('grossAmountInCents', 'int8', { notNull: true, codecRef: { codecId: 'pg/int8@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('netAmountInCents', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
          col('nextRetryAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('periodKey', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('rail', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('sourceDetails', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('state', 'text', {
            notNull: true,
            default: lit('Received'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('txHash', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1' },
          }),
          col('usdEquivalentInCents', 'int8', { codecRef: { codecId: 'pg/int8@1' } }),
          col('version', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('virtualAccountId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('transactions_currency_check_29bea278', "\"currency\" IN ('usd', 'eur')"),
          checkExpression(
            'transactions_state_check_70e62d22',
            "\"state\" IN ('Received', 'Converting', 'Credited', 'PayoutPending', 'PayoutSubmitted', 'Completed', 'InReview', 'Refunded', 'PayoutFailed')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'users',
        columns: [
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('deletedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('isEmailVerified', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('lastLoginAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('password', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('role', 'text', {
            notNull: true,
            default: lit('Customer'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('totpEnabled', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('totpSecret', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'users_role_check_2e8c077e',
            "\"role\" IN ('Customer', 'Support', 'Admin')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'virtual_accounts',
        columns: [
          col('bridgeVirtualAccountId', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('custodialWalletId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('customerId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('deactivatedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('depositInstructions', 'jsonb', {
            notNull: true,
            codecRef: { codecId: 'pg/jsonb@1' },
          }),
          col('destinationChain', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('destinationCurrency', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('sourceCurrency', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'virtual_accounts_destinationChain_check_5d330b1a',
            "\"destinationChain\" IN ('base', 'solana')",
          ),
          checkExpression(
            'virtual_accounts_sourceCurrency_check_059d2431',
            "\"sourceCurrency\" IN ('usd', 'eur')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'wallet_keys',
        columns: [
          col('algorithm', 'text', {
            notNull: true,
            default: lit('aes-256-gcm'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('authTag', 'bytea', { notNull: true, codecRef: { codecId: 'pg/bytea@1' } }),
          col('ciphertext', 'bytea', { notNull: true, codecRef: { codecId: 'pg/bytea@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('dataKeyAuthTag', 'bytea', { notNull: true, codecRef: { codecId: 'pg/bytea@1' } }),
          col('dataKeyIv', 'bytea', { notNull: true, codecRef: { codecId: 'pg/bytea@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('iv', 'bytea', { notNull: true, codecRef: { codecId: 'pg/bytea@1' } }),
          col('keyFormat', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('masterKeyVersion', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1' },
          }),
          col('walletId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('wrappedDataKey', 'bytea', { notNull: true, codecRef: { codecId: 'pg/bytea@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'wallets',
        columns: [
          col('address', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('chain', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('customerId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('keyExportedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('keyRemovedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('label', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('Active'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('wallets_chain_check_ed6bea37', "\"chain\" IN ('base', 'solana')"),
          checkExpression('wallets_status_check_b8b0c336', "\"status\" IN ('Active', 'Archived')"),
          checkExpression('wallets_type_check_e1df0d92', "\"type\" IN ('Generated', 'External')"),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'webhook_events',
        columns: [
          col('attempts', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('bridgeEventId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('category', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('error', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('objectId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('payload', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('processedAt', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('receivedAt', 'timestamptz(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('Pending'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'webhook_events_status_check_9ebe27a1',
            "\"status\" IN ('Pending', 'Processed', 'Failed', 'Ignored')",
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'custodial_wallets',
        constraint: 'custodial_wallets_bridgeWalletId_key',
        columns: ['bridgeWalletId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'custodial_wallets',
        constraint: 'custodial_wallets_customerId_chain_key',
        columns: ['customerId', 'chain'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'customers',
        constraint: 'customers_userId_key',
        columns: ['userId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'customers',
        constraint: 'customers_bridgeCustomerId_key',
        columns: ['bridgeCustomerId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'customers',
        constraint: 'customers_kycLinkId_key',
        columns: ['kycLinkId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'fee_tiers',
        constraint: 'fee_tiers_feeScheduleId_position_key',
        columns: ['feeScheduleId', 'position'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'key_vault_canaries',
        constraint: 'key_vault_canaries_masterKeyVersion_key',
        columns: ['masterKeyVersion'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'monthly_volumes',
        constraint: 'monthly_volumes_customerId_periodKey_key',
        columns: ['customerId', 'periodKey'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'transactions',
        constraint: 'transactions_bridgeDepositId_key',
        columns: ['bridgeDepositId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'transactions',
        constraint: 'transactions_bridgeTransferId_key',
        columns: ['bridgeTransferId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'users',
        constraint: 'users_email_key',
        columns: ['email'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'virtual_accounts',
        constraint: 'virtual_accounts_bridgeVirtualAccountId_key',
        columns: ['bridgeVirtualAccountId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'wallet_keys',
        constraint: 'wallet_keys_walletId_key',
        columns: ['walletId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'wallets',
        constraint: 'wallets_customerId_chain_address_key',
        columns: ['customerId', 'chain', 'address'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'webhook_events',
        constraint: 'webhook_events_bridgeEventId_key',
        columns: ['bridgeEventId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'audit_logs',
        index: 'audit_logs_actorId_idx_a58f6b4b',
        columns: ['actorId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'audit_logs',
        index: 'audit_logs_createdAt_idx_9575dbd7',
        columns: ['createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'audit_logs',
        index: 'audit_logs_entity_entityId_idx_efadd7fc',
        columns: ['entity', 'entityId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'custodial_wallets',
        index: 'custodial_wallets_customerId_idx_b2a8a46c',
        columns: ['customerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'customers',
        index: 'customers_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'fee_schedules',
        index: 'fee_schedules_one_per_period_e121a2e1',
        columns: ['effectivePeriod'],
        extras: { where: "(\"status\" IN ('Scheduled', 'Active', 'Superseded'))", unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'fee_schedules',
        index: 'fee_schedules_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'fee_tiers',
        index: 'fee_tiers_feeScheduleId_idx_10a9ddd4',
        columns: ['feeScheduleId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'monthly_volumes',
        index: 'monthly_volumes_customerId_idx_b2a8a46c',
        columns: ['customerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'one_time_codes',
        index: 'one_time_codes_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'one_time_codes',
        index: 'one_time_codes_userId_purpose_idx_e49c32f0',
        columns: ['userId', 'purpose'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'support_messages',
        index: 'support_messages_authorId_idx_e47547ed',
        columns: ['authorId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'support_messages',
        index: 'support_messages_ticketId_idx_2fe526c3',
        columns: ['ticketId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'support_tickets',
        index: 'support_tickets_customerId_idx_b2a8a46c',
        columns: ['customerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'support_tickets',
        index: 'support_tickets_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'transaction_events',
        index: 'transaction_events_transactionId_idx_d3180832',
        columns: ['transactionId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'transactions',
        index: 'transactions_customerId_createdAt_idx_f10a1fb1',
        columns: ['customerId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'transactions',
        index: 'transactions_customerId_idx_b2a8a46c',
        columns: ['customerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'transactions',
        index: 'transactions_feeScheduleId_idx_10a9ddd4',
        columns: ['feeScheduleId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'transactions',
        index: 'transactions_state_idx_ea3378ea',
        columns: ['state'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'transactions',
        index: 'transactions_virtualAccountId_idx_e02ad156',
        columns: ['virtualAccountId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'virtual_accounts',
        index: 'virtual_accounts_custodialWalletId_idx_8d63e48e',
        columns: ['custodialWalletId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'virtual_accounts',
        index: 'virtual_accounts_customerId_idx_b2a8a46c',
        columns: ['customerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'wallet_keys',
        index: 'wallet_keys_masterKeyVersion_idx_333fdeaa',
        columns: ['masterKeyVersion'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'wallets',
        index: 'wallets_customerId_idx_b2a8a46c',
        columns: ['customerId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'wallets',
        index: 'wallets_one_generated_per_chain_d8b84b7f',
        columns: ['customerId', 'chain'],
        extras: { where: '("type" = \'Generated\')', unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'webhook_events',
        index: 'webhook_events_category_objectId_idx_8d0a5edf',
        columns: ['category', 'objectId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'webhook_events',
        index: 'webhook_events_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'custodial_wallets',
        foreignKey: {
          name: 'custodial_wallets_customerId_fkey',
          columns: ['customerId'],
          references: { schema: 'public', table: 'customers', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'customers',
        foreignKey: {
          name: 'customers_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'fee_tiers',
        foreignKey: {
          name: 'fee_tiers_feeScheduleId_fkey',
          columns: ['feeScheduleId'],
          references: { schema: 'public', table: 'fee_schedules', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'monthly_volumes',
        foreignKey: {
          name: 'monthly_volumes_customerId_fkey',
          columns: ['customerId'],
          references: { schema: 'public', table: 'customers', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'one_time_codes',
        foreignKey: {
          name: 'one_time_codes_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'support_messages',
        foreignKey: {
          name: 'support_messages_ticketId_fkey',
          columns: ['ticketId'],
          references: { schema: 'public', table: 'support_tickets', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'support_messages',
        foreignKey: {
          name: 'support_messages_authorId_fkey',
          columns: ['authorId'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'support_tickets',
        foreignKey: {
          name: 'support_tickets_customerId_fkey',
          columns: ['customerId'],
          references: { schema: 'public', table: 'customers', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'transaction_events',
        foreignKey: {
          name: 'transaction_events_transactionId_fkey',
          columns: ['transactionId'],
          references: { schema: 'public', table: 'transactions', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'transactions',
        foreignKey: {
          name: 'transactions_customerId_fkey',
          columns: ['customerId'],
          references: { schema: 'public', table: 'customers', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'transactions',
        foreignKey: {
          name: 'transactions_virtualAccountId_fkey',
          columns: ['virtualAccountId'],
          references: { schema: 'public', table: 'virtual_accounts', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'transactions',
        foreignKey: {
          name: 'transactions_feeScheduleId_fkey',
          columns: ['feeScheduleId'],
          references: { schema: 'public', table: 'fee_schedules', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'virtual_accounts',
        foreignKey: {
          name: 'virtual_accounts_customerId_fkey',
          columns: ['customerId'],
          references: { schema: 'public', table: 'customers', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'virtual_accounts',
        foreignKey: {
          name: 'virtual_accounts_custodialWalletId_fkey',
          columns: ['custodialWalletId'],
          references: { schema: 'public', table: 'custodial_wallets', columns: ['id'] },
          onDelete: 'restrict',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'wallet_keys',
        foreignKey: {
          name: 'wallet_keys_walletId_fkey',
          columns: ['walletId'],
          references: { schema: 'public', table: 'wallets', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'wallets',
        foreignKey: {
          name: 'wallets_customerId_fkey',
          columns: ['customerId'],
          references: { schema: 'public', table: 'customers', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
