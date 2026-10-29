#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/0d7c10eeac2c6ff2294dd684fffd6160a290b48b464939592db20138febda647/contract';
import startContract from '../../snapshots/0d7c10eeac2c6ff2294dd684fffd6160a290b48b464939592db20138febda647/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/20d98f4734d9bc1c65c7605e1bc02ba8dcd48e231daae04e0d55542cb3846ce6/contract';
import endContract from '../../snapshots/20d98f4734d9bc1c65c7605e1bc02ba8dcd48e231daae04e0d55542cb3846ce6/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'users',
        column: col('totpBackupCodes', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
