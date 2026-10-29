import { ObjectType, Field, ID } from 'type-graphql';

import { Entity } from '#src/graphql/interface.js';
import { Chain, FiatCurrency, VirtualAccountStatus } from '#src/graphql/enum.js';

/** Normalized view of Bridge `source_deposit_instructions` (ACH/wire for USD, SEPA for EUR). */
@ObjectType()
export class DepositInstructions {
  @Field(() => String)
  currency: string;

  @Field(() => [String])
  paymentRails: string[];

  @Field(() => String, { nullable: true })
  bankName?: string | null;

  @Field(() => String, { nullable: true })
  bankAddress?: string | null;

  @Field(() => String, { nullable: true })
  routingNumber?: string | null;

  @Field(() => String, { nullable: true })
  accountNumber?: string | null;

  @Field(() => String, { nullable: true })
  beneficiaryName?: string | null;

  @Field(() => String, { nullable: true })
  beneficiaryAddress?: string | null;

  @Field(() => String, { nullable: true })
  iban?: string | null;

  @Field(() => String, { nullable: true })
  bic?: string | null;

  @Field(() => String, { nullable: true })
  accountHolderName?: string | null;
}

@ObjectType({ implements: Entity })
export class VirtualAccount extends Entity {
  @Field(() => ID)
  customerId: string;

  @Field(() => ID)
  custodialWalletId: string;

  bridgeVirtualAccountId: string;

  @Field(() => FiatCurrency)
  sourceCurrency: FiatCurrency | string;

  @Field(() => String)
  destinationCurrency: string;

  @Field(() => Chain)
  destinationChain: Chain | string;

  depositInstructions: unknown;

  @Field(() => VirtualAccountStatus)
  status: VirtualAccountStatus | string;

  @Field(() => Date, { nullable: true })
  deactivatedAt?: Date | null;
}
