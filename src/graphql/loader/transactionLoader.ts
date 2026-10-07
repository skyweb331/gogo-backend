import DataLoader from 'dataloader';

import type RootDataLoader from './index.js';
import { groupBy, uniq } from './utils.js';
import type { TransactionEventRow } from '#src/service/prisma.js';

export const transactionEventsLoader = (parent: RootDataLoader) => {
  return new DataLoader<number, TransactionEventRow[]>(
    async (transactionIds) => {
      const rows = await parent.prisma.orm.TransactionEvent.where((e) =>
        e.transactionId.in(uniq(transactionIds))
      )
        .orderBy([(e) => e.createdAt.asc(), (e) => e.id.asc()])
        .all();
      return groupBy(transactionIds, rows, (e) => e.transactionId);
    },
    { ...parent.dataLoaderOptions }
  );
};
