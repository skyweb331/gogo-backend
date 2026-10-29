import { ObjectType, Field, ID, UseMiddleware } from 'type-graphql';
import { GraphQLJSON } from 'graphql-type-json';

import { Entity } from '#src/graphql/interface.js';
import { CustomerStatus, CustomerType } from '#src/graphql/enum.js';
import { StaffOnlyField } from '#src/graphql/middleware/customer.permission.js';

@ObjectType({ implements: Entity })
export class Customer extends Entity {
  @Field(() => ID)
  userId: string;

  @Field(() => CustomerType, { nullable: true })
  type?: CustomerType | string | null;

  @Field(() => CustomerStatus)
  status: CustomerStatus | string;

  @Field(() => String, { nullable: true })
  country?: string | null;

  @Field(() => String, { nullable: true })
  region?: string | null;

  @UseMiddleware(StaffOnlyField)
  @Field(() => String, { nullable: true, description: 'Bridge customer id (staff only)' })
  bridgeCustomerId?: string | null;

  kycLinkId?: string | null;

  @Field(() => String)
  kycStatus: string;

  @Field(() => String)
  tosStatus: string;

  @UseMiddleware(StaffOnlyField)
  @Field(() => String, { nullable: true, description: 'Hosted Bridge KYC link (staff only)' })
  kycLink?: string | null;

  tosLink?: string | null;

  @Field(() => GraphQLJSON, { nullable: true })
  endorsements?: unknown;

  @Field(() => GraphQLJSON, { nullable: true })
  rejectionReasons?: unknown;

  @Field(() => ID, { nullable: true })
  payoutWalletId?: string | null;

  @Field(() => Date, { nullable: true })
  onboardedAt?: Date | null;

  @Field(() => Date, { nullable: true })
  suspendedAt?: Date | null;
}
