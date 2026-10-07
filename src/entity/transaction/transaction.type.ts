import { IsEnum, IsInt, Matches } from 'class-validator';
import { ArgsType, Field, InputType, Int, ObjectType } from 'type-graphql';

import { PaginatedResponse } from '#src/graphql/response/index.js';
import { QueryArgsBase } from '#src/graphql/queryArgs.js';
import { FiatCurrency } from '#src/graphql/enum.js';

import { Transaction } from './transaction.entity.js';

@ArgsType()
export class TransactionQueryArgs extends QueryArgsBase {}

@ObjectType()
export class TransactionsResponse extends PaginatedResponse {
  @Field(() => [Transaction], { nullable: true })
  transactions?: Transaction[];
}

@InputType()
export class SimulateDepositInput {
  @Field(() => Int)
  @IsInt()
  customerId: number;

  @Field(() => String, { description: 'Decimal amount, e.g. "8000.00"' })
  @Matches(/^\d{1,9}(\.\d{1,2})?$/, { message: 'Enter an amount like 8000.00' })
  amount: string;

  @Field(() => FiatCurrency)
  @IsEnum(FiatCurrency)
  currency: FiatCurrency;
}
