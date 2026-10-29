import { ObjectType, Field, ID, Int } from 'type-graphql';

import { Entity } from '#src/graphql/interface.js';
import { FeeScheduleStatus } from '#src/graphql/enum.js';
import { GraphQLBigInt } from '#src/graphql/scalar/index.js';

@ObjectType()
export class FeeTier {
  @Field(() => ID)
  id: string;

  @Field(() => Int)
  position: number;

  @Field(() => GraphQLBigInt)
  fromInCents: bigint;

  @Field(() => GraphQLBigInt, { nullable: true, description: 'null = no upper limit' })
  toInCents: bigint | null;

  @Field(() => Int, { description: 'Rate in basis points (100 = 1%)' })
  rateBps: number;
}

/** A global monthly fee schedule. It applies from the 1st of `effectivePeriod` (UTC). */
@ObjectType({ implements: Entity })
export class FeeSchedule extends Entity {
  @Field(() => String, { description: 'YYYY-MM' })
  effectivePeriod: string;

  @Field(() => FeeScheduleStatus)
  status: FeeScheduleStatus | string;

  @Field(() => String, { nullable: true })
  notes?: string | null;

  @Field(() => Boolean)
  notifyCustomers: boolean;

  @Field(() => ID, { nullable: true })
  createdById?: string | null;

  @Field(() => ID, { nullable: true })
  publishedById?: string | null;

  @Field(() => Date, { nullable: true })
  publishedAt?: Date | null;

  @Field(() => Date, { nullable: true })
  cancelledAt?: Date | null;
}
