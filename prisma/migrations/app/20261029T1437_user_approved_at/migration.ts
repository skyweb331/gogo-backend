#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/20d98f4734d9bc1c65c7605e1bc02ba8dcd48e231daae04e0d55542cb3846ce6/contract';
import startContract from '../../snapshots/20d98f4734d9bc1c65c7605e1bc02ba8dcd48e231daae04e0d55542cb3846ce6/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/e42e77210363488fd60067b61fc9eeabd25ed2fa8566223b21743d95e9e1063e/contract';
import endContract from '../../snapshots/e42e77210363488fd60067b61fc9eeabd25ed2fa8566223b21743d95e9e1063e/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, rawSql } from '@prisma/orm-postgres/migration';

/** Everyone who signed up before approvals existed counts as approved. */
export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'users',
        column: col('approvedAt', 'timestamptz(3)', {
          codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
        }),
      }),
      rawSql({
        id: 'data.users.approvedAt.backfill',
        label: 'Approve existing users',
        operationClass: 'data',
        target: { id: 'postgres' },
        precheck: [],
        execute: [
          {
            description: 'set approvedAt = createdAt for existing users',
            sql: `UPDATE "public"."users" SET "approvedAt" = "createdAt" WHERE "approvedAt" IS NULL`,
          },
        ],
        postcheck: [
          {
            description: 'every existing user is approved',
            sql: `SELECT NOT EXISTS (SELECT 1 FROM "public"."users" WHERE "approvedAt" IS NULL) AS "result"`,
          },
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
