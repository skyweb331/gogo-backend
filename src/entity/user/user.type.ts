import { IsEmail, IsIn, IsOptional, Length, Matches, MaxLength, MinLength } from 'class-validator';
import { ObjectType, InputType, Field, ArgsType, Int } from 'type-graphql';

import { PaginatedResponse } from '#src/graphql/response/index.js';
import { QueryArgsBase } from '#src/graphql/queryArgs.js';
import { UserRole } from '#src/graphql/enum.js';

import { User } from './user.entity.js';

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).+$/;
const PASSWORD_MESSAGE = 'Password must contain at least one letter and one number';

// User Query Args
@ArgsType()
export class UserQueryArgs extends QueryArgsBase {}

// User list response with pagination ( total )
@ObjectType()
export class UsersResponse extends PaginatedResponse {
  @Field(() => [User], { nullable: true })
  users?: User[];
}

@InputType()
export class SignUpInput {
  @Field(() => String)
  @Length(1, 120)
  name: string;

  @Field(() => String)
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  email: string;

  @Field(() => String)
  @MinLength(10, { message: 'Password must be at least 10 characters' })
  @MaxLength(128)
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  password: string;

  /** ISO 3166-1 alpha-2 */
  @Field(() => String)
  @Matches(/^[A-Za-z]{2}$/, { message: 'Select your country' })
  country: string;

  /** US state code, required when country is US */
  @Field(() => String, { nullable: true })
  @IsOptional()
  @Matches(/^[A-Za-z]{2}$/, { message: 'Select your state' })
  region?: string;
}

// Login Input and Response
@InputType()
export class LoginInput {
  @Field(() => String)
  email: string;

  @Field(() => String)
  password: string;

  @Field(() => Boolean, { nullable: true })
  isAdmin?: boolean = false;
}

@ObjectType()
export class LoginResponse {
  @Field(() => String, { nullable: true })
  accessToken?: string;

  /** Staff: enter the authenticator code with `verifyAdminTotp` */
  @Field(() => Boolean)
  mfaRequired: boolean = false;

  /** Staff without 2FA: run `beginTotpSetup` / `confirmTotpSetup` */
  @Field(() => Boolean)
  totpSetupRequired: boolean = false;

  /** Short-lived token for the TOTP step */
  @Field(() => String, { nullable: true })
  mfaToken?: string;
}

@InputType()
export class TotpInput {
  @Field(() => String)
  mfaToken: string;

  @Field(() => String)
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code' })
  code: string;
}

@ObjectType()
export class TotpSetup {
  @Field(() => String)
  secret: string;

  @Field(() => String)
  otpauthUrl: string;
}

@InputType()
export class VerifyEmailInput {
  @Field(() => String)
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code' })
  code: string;
}

@InputType()
export class RequestPasswordResetInput {
  @Field(() => String)
  @IsEmail({}, { message: 'Enter a valid email address' })
  email: string;

  @Field(() => Boolean, { nullable: true })
  isAdmin?: boolean = false;
}

@InputType()
export class ResetPasswordInput {
  @Field(() => String)
  token: string;

  @Field(() => String)
  @MinLength(10, { message: 'Password must be at least 10 characters' })
  @MaxLength(128)
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  password: string;
}

@InputType()
export class UpdatePasswordInput {
  @Field(() => String)
  oldPassword: string;

  @Field(() => String)
  @MinLength(10, { message: 'Password must be at least 10 characters' })
  @MaxLength(128)
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  newPassword: string;
}

@InputType()
export class UpdateProfileInput {
  @Field(() => String)
  @Length(1, 120)
  name: string;
}

const STAFF_ROLES = [UserRole.Admin, UserRole.Support];

@InputType()
export class CreateStaffUserInput {
  @Field(() => String)
  @Length(1, 120)
  name: string;

  @Field(() => String)
  @IsEmail({}, { message: 'Enter a valid email address' })
  email: string;

  @Field(() => UserRole)
  @IsIn(STAFF_ROLES, { message: 'Role must be Admin or Support' })
  role: UserRole;
}

@InputType()
export class UpdateStaffUserInput {
  @Field(() => Int)
  id: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @Length(1, 120)
  name?: string;

  @Field(() => UserRole, { nullable: true })
  @IsOptional()
  @IsIn(STAFF_ROLES, { message: 'Role must be Admin or Support' })
  role?: UserRole;

  /** Disable (soft delete) or re-enable the account */
  @Field(() => Boolean, { nullable: true })
  disabled?: boolean;
}
