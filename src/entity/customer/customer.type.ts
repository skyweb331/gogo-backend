import { IsOptional, MaxLength } from 'class-validator';
import { ArgsType, Field, ID, InputType, ObjectType } from 'type-graphql';

import { PaginatedResponse } from '#src/graphql/response/index.js';
import { QueryArgsBase } from '#src/graphql/queryArgs.js';
import { FiatCurrency } from '#src/graphql/enum.js';

import { Customer } from './customer.entity.js';

@ArgsType()
export class CustomerQueryArgs extends QueryArgsBase {
  @Field(() => String, { nullable: true, description: 'Matches the user email or name' })
  @IsOptional()
  @MaxLength(120)
  search?: string;

  @Field(() => Boolean, { nullable: true, description: 'Only sign-ups staff have not approved' })
  @IsOptional()
  awaitingApproval?: boolean;
}

@ObjectType()
export class CustomersResponse extends PaginatedResponse {
  @Field(() => [Customer], { nullable: true })
  customers?: Customer[];
}

@InputType()
export class SuspendCustomerInput {
  @Field(() => ID)
  id: string;

  @Field(() => String)
  @MaxLength(500)
  reason: string;
}

@ObjectType({ description: 'Outcome of opening one missing deposit account' })
export class DepositAccountResult {
  @Field(() => FiatCurrency)
  currency: FiatCurrency;

  @Field(() => Boolean)
  opened: boolean;

  @Field(() => String, {
    nullable: true,
    description: 'Bridge error when the account could not be opened',
  })
  error?: string | null;
}
