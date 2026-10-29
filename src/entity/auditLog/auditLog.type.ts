import { ArgsType, Field, ID, ObjectType } from 'type-graphql';
import { GraphQLJSON } from 'graphql-type-json';

import { PaginatedResponse } from '#src/graphql/response/index.js';
import { QueryArgsBase } from '#src/graphql/queryArgs.js';

@ObjectType()
export class AuditLog {
  @Field(() => ID)
  id: string;

  @Field(() => ID, { nullable: true })
  actorId?: string | null;

  @Field(() => String, { nullable: true })
  actorRole?: string | null;

  @Field(() => String)
  action: string;

  @Field(() => String)
  entity: string;

  @Field(() => String, { nullable: true })
  entityId?: string | null;

  @Field(() => GraphQLJSON, { nullable: true })
  before?: unknown;

  @Field(() => GraphQLJSON, { nullable: true })
  after?: unknown;

  @Field(() => String, { nullable: true })
  ip?: string | null;

  @Field(() => Date)
  createdAt: Date;
}

@ArgsType()
export class AuditLogQueryArgs extends QueryArgsBase {}

@ObjectType()
export class AuditLogsResponse extends PaginatedResponse {
  @Field(() => [AuditLog], { nullable: true })
  auditLogs?: AuditLog[];
}
