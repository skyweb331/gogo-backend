import DataLoader from 'dataloader';

import type RootDataLoader from './index.js';
import { groupBy, indexBy, uniq } from './utils.js';
import type { FeeScheduleRow, FeeTierRow } from '#src/service/prisma.js';

export const feeScheduleLoader = (parent: RootDataLoader) => {
  return new DataLoader<number, FeeScheduleRow | null>(
    async (ids) => {
      const rows = await parent.prisma.orm.FeeSchedule.where((s) => s.id.in(uniq(ids))).all();
      return indexBy(ids, rows, (s) => s.id);
    },
    { ...parent.dataLoaderOptions }
  );
};

export const feeTiersLoader = (parent: RootDataLoader) => {
  return new DataLoader<number, FeeTierRow[]>(
    async (scheduleIds) => {
      const rows = await parent.prisma.orm.FeeTier.where((t) =>
        t.feeScheduleId.in(uniq(scheduleIds))
      )
        .orderBy((t) => t.position.asc())
        .all();
      return groupBy(scheduleIds, rows, (t) => t.feeScheduleId);
    },
    { ...parent.dataLoaderOptions }
  );
};
