import { ObjectType, Field, ArgsType } from 'type-graphql';

import { PaginatedResponse } from '#src/graphql/response/index.js';
import { QueryArgsBase } from '#src/graphql/queryArgs.js';

import { VirtualAccount } from './virtualAccount.entity.js';

@ArgsType()
export class VirtualAccountQueryArgs extends QueryArgsBase {}

@ObjectType()
export class VirtualAccountsResponse extends PaginatedResponse {
  @Field(() => [VirtualAccount], { nullable: true })
  virtualAccounts?: VirtualAccount[];
}
