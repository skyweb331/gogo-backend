import DataLoader from 'dataloader';

import type RootDataLoader from './index.js';
import { groupBy, uniq } from './utils.js';
import type { SupportMessageRow } from '#src/service/prisma.js';

export const supportMessagesLoader = (parent: RootDataLoader) => {
  return new DataLoader<number, SupportMessageRow[]>(
    async (ticketIds) => {
      const rows = await parent.prisma.orm.SupportMessage.where((m) =>
        m.ticketId.in(uniq(ticketIds))
      )
        .orderBy([(m) => m.createdAt.asc(), (m) => m.id.asc()])
        .all();
      return groupBy(ticketIds, rows, (m) => m.ticketId);
    },
    { ...parent.dataLoaderOptions }
  );
};
