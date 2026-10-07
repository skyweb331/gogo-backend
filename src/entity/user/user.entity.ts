import { ObjectType, Field } from 'type-graphql';

import { Entity } from '#src/graphql/interface.js';
import { UserRole } from '#src/graphql/enum.js';

@ObjectType({ implements: Entity })
export class User extends Entity {
  @Field(() => String)
  name: string;

  @Field(() => String)
  email: string;

  // Exclude password and TOTP secret from response
  password?: string;
  totpSecret?: string | null;

  @Field(() => UserRole)
  role: UserRole | string;

  @Field(() => Boolean)
  isEmailVerified: boolean;

  @Field(() => Boolean)
  totpEnabled: boolean;

  @Field(() => Date, { nullable: true })
  lastLoginAt?: Date | null;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date | null;
}
