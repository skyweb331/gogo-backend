import { Service } from 'typedi';
import { Arg, Authorized, Ctx, Mutation, Query, Resolver } from 'type-graphql';

import { type Context } from '#src/context.js';
import { UserRole } from '#src/graphql/enum.js';

import {
  ConfigureFeeExternalAccountInput,
  DashboardStats,
  FeeExternalAccountInfo,
} from './admin.type.js';
import { AdminService } from './admin.service.js';

@Service()
@Resolver()
export class AdminResolver {
  constructor(private readonly service: AdminService) {}

  @Authorized([UserRole.Support])
  @Query(() => DashboardStats)
  async dashboardStats() {
    return this.service.dashboardStats();
  }

  @Authorized([UserRole.Admin])
  @Query(() => FeeExternalAccountInfo, {
    nullable: true,
    description: 'Where Bridge pays out NxPay fees',
  })
  async feeExternalAccount() {
    return this.service.feeExternalAccount();
  }

  @Authorized([UserRole.Admin])
  @Mutation(() => FeeExternalAccountInfo)
  async configureFeeExternalAccount(
    @Arg('input') input: ConfigureFeeExternalAccountInput,
    @Ctx() ctx: Context
  ) {
    return this.service.configureFeeExternalAccount(input, ctx);
  }
}
