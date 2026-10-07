import { Service } from 'typedi';

import { PrismaService, type MonthlyVolumeRow } from '#src/service/prisma.js';
import { isSqlError } from '#src/utils/errors.js';

import type { MonthlyVolumeQueryArgs } from './monthlyVolume.type.js';

const MAX_ATTEMPTS = 5;

const VOLUME_LIST = {
  model: 'MonthlyVolume',
  filterable: ['id', 'customerId', 'periodKey', 'volumeInCents', 'feeInCents', 'txCount'],
  sortable: ['periodKey', 'volumeInCents', 'feeInCents', 'txCount'],
  defaultSort: 'periodKey',
} as const;

/** Per-customer, per-month USD volume used for tier placement. */
@Service()
export class MonthlyVolumeService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: MonthlyVolumeQueryArgs): Promise<MonthlyVolumeRow[]> {
    return query.applyTo(this.prisma.orm.MonthlyVolume, VOLUME_LIST).all();
  }

  async count(query: MonthlyVolumeQueryArgs): Promise<number> {
    const { total } = await query
      .applyFilter(this.prisma.orm.MonthlyVolume, VOLUME_LIST)
      .aggregate((a) => ({ total: a.count() }));
    return Number(total);
  }

  async get(customerId: number, periodKey: string) {
    return this.prisma.orm.MonthlyVolume.where({ customerId, periodKey }).first();
  }

  async volumeOf(customerId: number, periodKey: string): Promise<bigint> {
    return (await this.get(customerId, periodKey))?.volumeInCents ?? 0n;
  }

  private async getOrCreate(customerId: number, periodKey: string): Promise<MonthlyVolumeRow> {
    const existing = await this.get(customerId, periodKey);
    if (existing) return existing;
    try {
      return await this.prisma.orm.MonthlyVolume.create({ customerId, periodKey });
    } catch (error) {
      if (!isSqlError(error, '23505')) throw error;
      return (await this.get(customerId, periodKey))!;
    }
  }

  /**
   * Adds (or with negative values, removes) a deposit with an optimistic `version` lock.
   * Callers serialize per customer (pg-boss group + advisory lock); the version check
   * is the last line of defence.
   */
  async apply(
    customerId: number,
    periodKey: string,
    deltaVolume: bigint,
    deltaFee: bigint,
    deltaCount: number
  ) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const row = await this.getOrCreate(customerId, periodKey);
      const volume = row.volumeInCents + deltaVolume;
      const fee = row.feeInCents + deltaFee;
      const updated = await this.prisma.orm.MonthlyVolume.where({
        id: row.id,
        version: row.version,
      }).update({
        volumeInCents: volume < 0n ? 0n : volume,
        feeInCents: fee < 0n ? 0n : fee,
        txCount: Math.max(0, row.txCount + deltaCount),
        version: row.version + 1,
      });
      if (updated) return updated;
    }
    throw new Error(`MonthlyVolume ${customerId}/${periodKey} kept changing; retry later`);
  }
}
