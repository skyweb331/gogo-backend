import { Service } from 'typedi';

import { PrismaService, toJson, type JsonValue } from '#src/service/prisma.js';
import { isSqlError } from '#src/utils/errors.js';

/** Small key/value store for runtime settings and job cursors. */
@Service()
export class AppSettingService {
  constructor(private readonly prisma: PrismaService) {}

  async get<T extends JsonValue>(key: string, fallback: T): Promise<T> {
    const row = await this.prisma.orm.AppSetting.where({ key }).first();
    return row ? (row.value as T) : fallback;
  }

  async set(key: string, value: unknown) {
    const json = toJson(value);
    const updated = await this.prisma.orm.AppSetting.where({ key }).update({ value: json });
    if (updated) return updated;
    try {
      return await this.prisma.orm.AppSetting.create({ key, value: json });
    } catch (error) {
      if (!isSqlError(error, '23505')) throw error;
      return this.prisma.orm.AppSetting.where({ key }).update({ value: json });
    }
  }
}
