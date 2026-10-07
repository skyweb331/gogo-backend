import { Field, InputType, Int } from 'type-graphql';

@InputType()
export class EntityID {
  @Field(() => Int)
  id: number;
}

/** Re-authentication for sensitive customer actions: password + emailed OTP. */
@InputType()
export class ReauthInput {
  @Field(() => String)
  password: string;

  @Field(() => String)
  otp: string;
}
