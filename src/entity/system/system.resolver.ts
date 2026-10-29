import { Field, ObjectType, Query, Resolver } from 'type-graphql';
import { Service } from 'typedi';

import { config, isBridgeSandbox } from '#src/config.js';
import { Chain } from '#src/graphql/enum.js';

@ObjectType()
export class AppInfo {
  @Field(() => String)
  bridgeEnv: string;

  @Field(() => Boolean)
  sandbox: boolean;

  @Field(() => Chain)
  defaultPayoutChain: Chain;

  @Field(() => Date)
  serverTime: Date;
}

@Service()
@Resolver()
export class SystemResolver {
  @Query(() => AppInfo)
  appInfo(): AppInfo {
    return {
      bridgeEnv: config.BRIDGE_ENV,
      sandbox: isBridgeSandbox,
      defaultPayoutChain: config.DEFAULT_PAYOUT_CHAIN as Chain,
      serverTime: new Date(),
    };
  }
}
