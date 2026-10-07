import { ArgsType, Field } from 'type-graphql';
import { GraphQLJSONObject } from 'graphql-type-json';

import { applyFilter, applyList, parsePage, type ApplyOptions } from '#src/service/queryBuilder.js';

/**
 * limelite's list arguments (`sort`, `page`, `filter`), unchanged for the frontends.
 *
 * - sort: `field` = desc, `-field` = asc, comma separated
 * - page: `page,limit` (default `1,50`)
 * - filter: `{ field: value | { eq, ne, gt, gte, lt, lte, in, contains, startsWith, endsWith } }`,
 *   with `AND` / `OR` / `NOT`; a key `a_b` searches `a` OR `b`.
 *
 * Prisma 8 has no `XWhereInput` types, so instead of a `where` getter the args
 * apply themselves to an ORM collection, restricted to per-entity allowlists.
 */
@ArgsType()
export abstract class QueryArgsBase {
  @Field(() => String, { nullable: true })
  sort?: string;

  @Field(() => String, { nullable: true })
  page?: string;

  @Field(() => GraphQLJSONObject, { nullable: true })
  filter?: Record<string, any>;

  get parsePage(): { limit: number; offset: number } {
    return parsePage(this.page);
  }

  /** filter + sort + page */
  applyTo<C>(collection: C, options: ApplyOptions): C {
    return applyList(collection, this, options);
  }

  /** filter only, for `total` */
  applyFilter<C>(collection: C, options: ApplyOptions): C {
    return applyFilter(collection, this, options);
  }
}
