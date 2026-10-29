import { Field, ID, InputType } from 'type-graphql';

@InputType()
export class EntityID {
  @Field(() => ID)
  id: string;
}

/** Re-authentication for sensitive customer actions: password + emailed OTP. */
@InputType()
export class ReauthInput {
  @Field(() => String)
  password: string;

  @Field(() => String)
  otp: string;
}
