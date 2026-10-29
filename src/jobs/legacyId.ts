import { Container } from 'typedi';

import { PrismaService, type Orm } from '#src/service/prisma.js';
import { legacyIdOf } from '#src/utils/id.js';

const LOOKUP = {
  Customer: (orm: Orm, legacyId: number) => orm.Customer.where({ legacyId }).first(),
  Transaction: (orm: Orm, legacyId: number) => orm.Transaction.where({ legacyId }).first(),
  WebhookEvent: (orm: Orm, legacyId: number) => orm.WebhookEvent.where({ legacyId }).first(),
  FeeSchedule: (orm: Orm, legacyId: number) => orm.FeeSchedule.where({ legacyId }).first(),
};

/**
 * Jobs queued before the UUID migration carry integer ids. Returns the row's UUID, or null
 * when no row has that legacy id.
 */
export const resolveJobId = async (
  model: keyof typeof LOOKUP,
  value: string | number
): Promise<string | null> => {
  const legacyId = legacyIdOf(value);
  if (legacyId === null) return String(value);
  const row = await LOOKUP[model](Container.get(PrismaService).orm, legacyId);
  if (!row) console.warn(`[jobs] no ${model} with legacy id ${legacyId}`);
  return row?.id ?? null;
};
