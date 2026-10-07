import { ObjectType, Field, Int } from 'type-graphql';

import { Entity } from '#src/graphql/interface.js';
import { Chain, WalletStatus, WalletType } from '#src/graphql/enum.js';

/** A customer payout address (USDC and EURC on its chain). Key material is never exposed. */
@ObjectType({ implements: Entity })
export class Wallet extends Entity {
  @Field(() => Int)
  customerId: number;

  @Field(() => Chain)
  chain: Chain | string;

  @Field(() => String)
  address: string;

  @Field(() => String, { nullable: true })
  label?: string | null;

  @Field(() => WalletType)
  type: WalletType | string;

  @Field(() => WalletStatus)
  status: WalletStatus | string;

  @Field(() => Date, { nullable: true })
  keyExportedAt?: Date | null;

  @Field(() => Date, { nullable: true })
  keyRemovedAt?: Date | null;
}
