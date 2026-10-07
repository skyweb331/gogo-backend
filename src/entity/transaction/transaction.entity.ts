import { ObjectType, Field, Int } from 'type-graphql';
import { GraphQLJSON } from 'graphql-type-json';

import { Entity } from '#src/graphql/interface.js';
import { FiatCurrency, TransactionEventSource, TransactionState } from '#src/graphql/enum.js';
import { GraphQLBigInt } from '#src/graphql/scalar/index.js';

/** One row per deposit: fiat in, stablecoin out to the customer's payout wallet. */
@ObjectType({ implements: Entity })
export class Transaction extends Entity {
  @Field(() => Int)
  customerId: number;

  @Field(() => Int, { nullable: true })
  virtualAccountId?: number | null;

  bridgeDepositId: string;
  bridgeTransferId?: string | null;

  @Field(() => String, { nullable: true, description: 'ach_push | wire | sepa' })
  rail?: string | null;

  @Field(() => FiatCurrency)
  currency: FiatCurrency | string;

  @Field(() => GraphQLBigInt)
  grossAmountInCents: bigint;

  @Field(() => GraphQLBigInt, { nullable: true })
  usdEquivalentInCents?: bigint | null;

  @Field(() => String, { nullable: true })
  fxRate?: string | null;

  @Field(() => GraphQLBigInt, { nullable: true, description: 'Bridge conversion fee' })
  exchangeFeeInCents?: bigint | null;

  @Field(() => GraphQLBigInt, {
    nullable: true,
    description: 'Stablecoin credited to the custodial wallet',
  })
  creditedAmountInCents?: bigint | null;

  @Field(() => GraphQLBigInt, { nullable: true, description: 'GOGO fee, in the deposit currency' })
  feeInCents?: bigint | null;

  @Field(() => GraphQLBigInt, {
    nullable: true,
    description: 'Stablecoin sent to the payout wallet',
  })
  netAmountInCents?: bigint | null;

  @Field(() => GraphQLJSON, { nullable: true })
  feeBreakdown?: unknown;

  @Field(() => Int, { nullable: true })
  feeScheduleId?: number | null;

  @Field(() => GraphQLJSON, { nullable: true })
  destinationWalletSnapshot?: unknown;

  @Field(() => GraphQLJSON, { nullable: true })
  sourceDetails?: unknown;

  @Field(() => String, { nullable: true })
  txHash?: string | null;

  @Field(() => TransactionState)
  state: TransactionState | string;

  @Field(() => String, { nullable: true })
  failureReason?: string | null;

  @Field(() => Int)
  attempts: number;

  @Field(() => Date, { nullable: true })
  nextRetryAt?: Date | null;

  @Field(() => String, { nullable: true })
  periodKey?: string | null;

  @Field(() => Date, { nullable: true })
  fundsReceivedAt?: Date | null;

  @Field(() => Date, { nullable: true })
  creditedAt?: Date | null;

  @Field(() => Date, { nullable: true })
  completedAt?: Date | null;

  version: number;
}

@ObjectType()
export class TransactionEvent {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  transactionId: number;

  @Field(() => TransactionEventSource)
  source: TransactionEventSource | string;

  @Field(() => String)
  type: string;

  payload?: unknown;

  @Field(() => Date)
  createdAt: Date;
}
