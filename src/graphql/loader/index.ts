// Inspired by Parabol Dataloader implementation
import DataLoader from 'dataloader';

import type { PrismaService } from '#src/service/prisma.js';

import * as customerLoader from './customerLoader.js';
import * as userLoader from './userLoader.js';
import * as walletLoader from './walletLoader.js';
import * as transactionLoader from './transactionLoader.js';
import * as feeLoader from './feeLoader.js';
import * as supportLoader from './supportLoader.js';

interface LoaderDict {
  [loaderName: string]: DataLoader<any, any>;
}

// Register all loaders
const loaderMakers = {
  ...customerLoader,
  ...userLoader,
  ...walletLoader,
  ...transactionLoader,
  ...feeLoader,
  ...supportLoader,
} as const;

type LoaderMakers = typeof loaderMakers;
export type Loaders = keyof LoaderMakers;

type Uncustom<T> = T extends (parent: RootDataLoader) => infer U ? U : never;
type TypeFromCustom<T extends Loaders> = Uncustom<LoaderMakers[T]>;

// Use this if you don't need the dataloader to be shareable
export interface DataLoaderInstance {
  get<LoaderName extends Loaders>(loaderName: LoaderName): TypeFromCustom<LoaderName>;
}

/**
 * This is the main dataloader
 */
export default class RootDataLoader implements DataLoaderInstance {
  readonly prisma: PrismaService;

  dataLoaderOptions: DataLoader.Options<any, any>;
  // casted to any because access to the loaders will results in a creation if needed
  loaders: LoaderDict = {} as any;

  constructor(prisma: PrismaService, dataLoaderOptions: DataLoader.Options<any, any> = {}) {
    this.prisma = prisma;
    this.dataLoaderOptions = dataLoaderOptions;
  }

  get<LoaderName extends Loaders>(loaderName: LoaderName): TypeFromCustom<LoaderName> {
    const loader = this.loaders[loaderName];

    if (loader) {
      return loader as TypeFromCustom<LoaderName>;
    }
    const loaderMaker = loaderMakers[loaderName] as (
      parent: RootDataLoader
    ) => DataLoader<any, any>;

    this.loaders[loaderName] = loaderMaker(this);

    return this.loaders[loaderName] as TypeFromCustom<LoaderName>;
  }
}
