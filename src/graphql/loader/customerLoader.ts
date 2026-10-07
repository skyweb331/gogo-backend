import DataLoader from 'dataloader';

import type RootDataLoader from './index.js';
import { indexBy, uniq } from './utils.js';
import type { CustomerRow } from '#src/service/prisma.js';

export const customerLoader = (parent: RootDataLoader) => {
  return new DataLoader<number, CustomerRow | null>(
    async (customerIds) => {
      const rows = await parent.prisma.orm.Customer.where((c) => c.id.in(uniq(customerIds))).all();
      return indexBy(customerIds, rows, (c) => c.id);
    },
    { ...parent.dataLoaderOptions }
  );
};

export const customerByUserLoader = (parent: RootDataLoader) => {
  return new DataLoader<number, CustomerRow | null>(
    async (userIds) => {
      const rows = await parent.prisma.orm.Customer.where((c) => c.userId.in(uniq(userIds))).all();
      return indexBy(userIds, rows, (c) => c.userId);
    },
    { ...parent.dataLoaderOptions }
  );
};
