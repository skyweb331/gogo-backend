import { ArgsType, Field, ID, Int, ObjectType } from 'type-graphql';

import { PaginatedResponse } from '#src/graphql/response/index.js';
import { QueryArgsBase } from '#src/graphql/queryArgs.js';
import { GraphQLBigInt } from '#src/graphql/scalar/index.js';

@ObjectType()
export class MonthlyVolume {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  customerId: string;

  @Field(() => String)
  periodKey: string;

  @Field(() => GraphQLBigInt, { description: 'USD-equivalent deposit volume' })
  volumeInCents: bigint;

  @Field(() => GraphQLBigInt, { description: 'Fees charged, USD cents' })
  feeInCents: bigint;

  @Field(() => Int)
  txCount: number;
}

@ArgsType()
export class MonthlyVolumeQueryArgs extends QueryArgsBase {}

@ObjectType()
export class MonthlyVolumesResponse extends PaginatedResponse {
  @Field(() => [MonthlyVolume], { nullable: true })
  monthlyVolumes?: MonthlyVolume[];
}
