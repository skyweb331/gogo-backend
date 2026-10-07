import { IsEnum, IsInt, IsOptional, Length, MaxLength } from 'class-validator';
import { Field, InputType, Int, ObjectType } from 'type-graphql';

import { Chain } from '#src/graphql/enum.js';

@InputType()
export class AddExternalWalletInput {
  @Field(() => Chain)
  @IsEnum(Chain, { message: 'Choose Base or Solana' })
  chain: Chain;

  @Field(() => String)
  @Length(26, 64, { message: 'Enter a valid wallet address' })
  address: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MaxLength(60)
  label?: string;

  @Field(() => Boolean, { nullable: true, description: 'Also make this the payout wallet' })
  @IsOptional()
  makePayout?: boolean;

  @Field(() => String)
  password: string;

  @Field(() => String)
  @Length(6, 6, { message: 'Enter the 6-digit code' })
  otp: string;
}

@InputType()
export class WalletReauthInput {
  @Field(() => Int)
  @IsInt()
  walletId: number;

  @Field(() => String)
  password: string;

  @Field(() => String)
  @Length(6, 6, { message: 'Enter the 6-digit code' })
  otp: string;
}

@InputType()
export class RemoveWalletKeyInput {
  @Field(() => Int)
  @IsInt()
  walletId: number;

  @Field(() => String)
  password: string;
}

@InputType()
export class UpdateWalletLabelInput {
  @Field(() => Int)
  @IsInt()
  walletId: number;

  @Field(() => String)
  @Length(1, 60)
  label: string;
}

/** Returned once; the frontend never caches it (`fetchPolicy: 'no-cache'`). */
@ObjectType()
export class ExportedWalletKey {
  @Field(() => Int)
  walletId: number;

  @Field(() => Chain)
  chain: Chain | string;

  @Field(() => String)
  address: string;

  @Field(() => String, { description: '0x hex (Base) or base58 64-byte keypair (Solana)' })
  privateKey: string;

  @Field(() => String)
  format: string;
}
