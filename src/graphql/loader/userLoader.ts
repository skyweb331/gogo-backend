import DataLoader from 'dataloader';

import type RootDataLoader from './index.js';
import { indexBy, uniq } from './utils.js';
import type { UserRow } from '#src/service/prisma.js';

export const userLoader = (parent: RootDataLoader) => {
  return new DataLoader<string, UserRow | null>(
    async (userIds) => {
      const users = await parent.prisma.orm.User.where((u) => u.id.in(uniq(userIds))).all();
      return indexBy(userIds, users, (u) => u.id);
    },
    { ...parent.dataLoaderOptions }
  );
};
