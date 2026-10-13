import { IsIn, IsOptional, Length, Matches, ValidateNested } from 'class-validator';
import { Field, InputType, Int, ObjectType } from 'type-graphql';

import { GraphQLBigInt } from '#src/graphql/scalar/index.js';

@ObjectType()
export class DailyVolume {
  @Field(() => String, { description: 'YYYY-MM-DD (UTC)' })
  date: string;

  @Field(() => GraphQLBigInt)
  volumeInCents: bigint;

  @Field(() => Int)
  count: number;
}

@ObjectType()
export class DashboardStats {
  @Field(() => String)
  periodKey: string;

  @Field(() => GraphQLBigInt, { description: 'USD equivalent of deposits counted this month' })
  volumeInCents: bigint;

  @Field(() => GraphQLBigInt, { description: 'NxPay fees this month (USD equivalent)' })
  feesInCents: bigint;

  @Field(() => Int)
  depositCount: number;

  @Field(() => Int)
  activeCustomers: number;

  @Field(() => Int)
  onboardingCustomers: number;

  @Field(() => Int)
  pendingKyc: number;

  @Field(() => Int)
  failedPayouts: number;

  @Field(() => Int)
  inFlightPayouts: number;

  @Field(() => Int)
  openTickets: number;

  @Field(() => Int)
  failedWebhooks: number;

  @Field(() => [DailyVolume], { description: 'Last 30 days, by deposit date' })
  daily: DailyVolume[];
}

@ObjectType()
export class FeeExternalAccountInfo {
  @Field(() => String)
  id: string;

  @Field(() => String)
  accountOwnerName: string;

  @Field(() => String, { nullable: true })
  bankName?: string | null;

  @Field(() => String, { nullable: true })
  last4?: string | null;

  @Field(() => Boolean)
  active: boolean;

  @Field(() => Date, { nullable: true })
  updatedAt?: Date | null;
}

@InputType()
export class FeeExternalAccountAddressInput {
  @Field(() => String)
  @Length(1, 120)
  streetLine1: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @Length(0, 120)
  streetLine2?: string;

  @Field(() => String)
  @Length(1, 80)
  city: string;

  @Field(() => String)
  @Length(2, 2, { message: 'Use the 2-letter state code' })
  state: string;

  @Field(() => String)
  @Matches(/^\d{5}(-\d{4})?$/, { message: 'Enter a valid ZIP code' })
  postalCode: string;

  @Field(() => String, { defaultValue: 'USA' })
  @IsIn(['USA'])
  country: string;
}

@InputType()
export class ConfigureFeeExternalAccountInput {
  @Field(() => String)
  @Length(1, 120)
  bankName: string;

  @Field(() => String)
  @Length(1, 120)
  accountOwnerName: string;

  @Field(() => String)
  @Matches(/^\d{4,17}$/, { message: 'Enter a valid account number' })
  accountNumber: string;

  @Field(() => String)
  @Matches(/^\d{9}$/, { message: 'Routing number must be 9 digits' })
  routingNumber: string;

  @Field(() => String)
  @IsIn(['checking', 'savings'])
  checkingOrSavings: 'checking' | 'savings';

  @Field(() => FeeExternalAccountAddressInput)
  @ValidateNested()
  address: FeeExternalAccountAddressInput;
}
