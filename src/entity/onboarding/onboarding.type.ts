import { IsEnum } from 'class-validator';
import { Field, InputType, ObjectType } from 'type-graphql';

import { CustomerStatus, CustomerType, FiatCurrency, OnboardingStep } from '#src/graphql/enum.js';

@InputType()
export class StartOnboardingInput {
  @Field(() => CustomerType)
  @IsEnum(CustomerType, { message: 'Choose individual or business' })
  type: CustomerType;
}

@ObjectType()
export class OnboardingStatus {
  @Field(() => OnboardingStep)
  step: OnboardingStep;

  @Field(() => CustomerStatus)
  status: CustomerStatus | string;

  @Field(() => CustomerType, { nullable: true })
  type?: CustomerType | string | null;

  @Field(() => String)
  kycStatus: string;

  @Field(() => String)
  tosStatus: string;

  @Field(() => [String])
  rejectionReasons: string[];

  @Field(() => String, { nullable: true, description: 'Bridge-hosted Terms of Service page' })
  tosLink?: string | null;

  @Field(() => String, { nullable: true, description: 'Bridge-hosted identity verification page' })
  kycLink?: string | null;

  @Field(() => [FiatCurrency], { description: 'Currencies with an active deposit account' })
  currencies: FiatCurrency[];

  @Field(() => Boolean, { description: 'Bridge sandbox: verification is simulated' })
  sandbox: boolean;
}
