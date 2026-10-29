import { IsBoolean, IsInt, IsOptional, MaxLength } from 'class-validator';
import { ArgsType, Field, ID, InputType, Int, ObjectType } from 'type-graphql';

import { PaginatedResponse } from '#src/graphql/response/index.js';
import { QueryArgsBase } from '#src/graphql/queryArgs.js';
import { FiatCurrency } from '#src/graphql/enum.js';
import { GraphQLBigInt } from '#src/graphql/scalar/index.js';

import { FeeSchedule } from './fee.entity.js';

@ArgsType()
export class FeeScheduleQueryArgs extends QueryArgsBase {}

@ObjectType()
export class FeeSchedulesResponse extends PaginatedResponse {
  @Field(() => [FeeSchedule], { nullable: true })
  feeSchedules?: FeeSchedule[];
}

@InputType()
export class FeeTierInput {
  @Field(() => GraphQLBigInt)
  fromInCents: bigint;

  @Field(() => GraphQLBigInt, { nullable: true })
  toInCents?: bigint | null;

  @Field(() => Int)
  @IsInt()
  rateBps: number;
}

@InputType()
export class CreateFeeScheduleDraftInput {
  @Field(() => String, { nullable: true, description: 'Defaults to next month' })
  @IsOptional()
  effectivePeriod?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(2000)
  notes?: string;

  @Field(() => [FeeTierInput], { nullable: true, description: 'Defaults to the current schedule' })
  @IsOptional()
  tiers?: FeeTierInput[];
}

@InputType()
export class UpdateFeeScheduleDraftInput {
  @Field(() => ID)
  id: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  effectivePeriod?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(2000)
  notes?: string;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  notifyCustomers?: boolean;

  @Field(() => [FeeTierInput], { nullable: true })
  @IsOptional()
  tiers?: FeeTierInput[];
}

@InputType()
export class PublishFeeScheduleInput {
  @Field(() => ID)
  id: string;

  @Field(() => String)
  effectivePeriod: string;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  notifyCustomers?: boolean;
}

@ObjectType()
export class FeeBreakdownLine {
  @Field(() => Int)
  position: number;

  @Field(() => GraphQLBigInt)
  fromInCents: bigint;

  @Field(() => GraphQLBigInt, { nullable: true })
  toInCents: bigint | null;

  @Field(() => Int)
  rateBps: number;

  @Field(() => GraphQLBigInt)
  amountInCents: bigint;

  @Field(() => GraphQLBigInt)
  feeInCents: bigint;
}

@ObjectType()
export class FeeQuote {
  @Field(() => FiatCurrency)
  currency: FiatCurrency;

  @Field(() => GraphQLBigInt, { description: 'Deposit amount in its own currency' })
  amountInCents: bigint;

  @Field(() => GraphQLBigInt, { description: 'Deposit converted to USD (tiers are in USD)' })
  usdEquivalentInCents: bigint;

  @Field(() => String, { nullable: true, description: 'EUR->USD rate used, if any' })
  fxRate?: string | null;

  @Field(() => GraphQLBigInt, { description: 'USD volume already counted this month' })
  prevVolumeInCents: bigint;

  @Field(() => GraphQLBigInt, { description: 'Fee in USD cents' })
  feeUsdInCents: bigint;

  @Field(() => GraphQLBigInt, { description: 'Fee in the deposit currency' })
  feeInCents: bigint;

  @Field(() => GraphQLBigInt, { description: 'Amount paid out, before Bridge conversion fees' })
  netInCents: bigint;

  @Field(() => Int)
  effectiveRateBps: number;

  @Field(() => [FeeBreakdownLine])
  breakdown: FeeBreakdownLine[];

  @Field(() => FeeSchedule)
  schedule: FeeSchedule;

  @Field(() => String)
  periodKey: string;
}

@ObjectType()
export class FeeSettings {
  @Field(() => Int, { description: 'The editor warns about rates above this' })
  softCapBps: number;

  @Field(() => String, { description: 'Earliest month a new schedule can start' })
  earliestEffectivePeriod: string;

  @Field(() => GraphQLBigInt, { description: 'Smallest payout Bridge accepts' })
  minimumPayoutInCents: bigint;
}

@InputType()
export class UpdateFeeSettingsInput {
  @Field(() => Int)
  @IsInt()
  softCapBps: number;
}
