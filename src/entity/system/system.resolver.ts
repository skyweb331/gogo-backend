import { Field, ObjectType, Query, Resolver } from 'type-graphql';
import { Service } from 'typedi';

import { config, isBridgeSandbox } from '#src/config.js';

@ObjectType()
export class AppInfo {
  @Field(() => String)
  bridgeEnv: string;

  @Field(() => Boolean)
  sandbox: boolean;

  @Field(() => String)
  defaultPayoutChain: string;

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
      defaultPayoutChain: config.DEFAULT_PAYOUT_CHAIN,
      serverTime: new Date(),
    };
  }
}
