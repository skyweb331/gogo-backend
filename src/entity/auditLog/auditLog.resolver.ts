import { Service } from 'typedi';
import { Args, Authorized, Ctx, FieldResolver, Info, Query, Resolver, Root } from 'type-graphql';
import graphqlFields from 'graphql-fields';
import type { GraphQLResolveInfo } from 'graphql';

import { type Context } from '#src/context.js';
import { UserRole } from '#src/graphql/enum.js';
import { User } from '#src/entity/user/user.entity.js';

import { AuditLog, AuditLogQueryArgs, AuditLogsResponse } from './auditLog.type.js';
import { AuditLogService } from './auditLog.service.js';

@Service()
@Resolver(() => AuditLog)
export class AuditLogResolver {
  constructor(private readonly service: AuditLogService) {}

  @Authorized([UserRole.Admin])
  @Query(() => AuditLogsResponse)
  async auditLogs(
    @Args() query: AuditLogQueryArgs,
    @Info() info: GraphQLResolveInfo
  ): Promise<AuditLogsResponse> {
    const fields = graphqlFields(info);
    const [total, auditLogs] = await Promise.all([
      'total' in fields ? this.service.count(query) : undefined,
      'auditLogs' in fields ? this.service.list(query) : undefined,
    ]);
    return { total, auditLogs };
  }

  @FieldResolver(() => User, { nullable: true })
  async actor(@Root() log: AuditLog, @Ctx() ctx: Context) {
    return log.actorId ? ctx.dataLoader.get('userLoader').load(log.actorId) : null;
  }
}
