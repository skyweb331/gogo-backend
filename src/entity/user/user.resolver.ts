import { Service } from 'typedi';
import {
  Arg,
  Args,
  Resolver,
  Query,
  Mutation,
  Authorized,
  FieldResolver,
  Ctx,
  Root,
  Info,
  Int,
} from 'type-graphql';
import graphqlFields from 'graphql-fields';
import type { GraphQLResolveInfo } from 'graphql';

import { type Context } from '#src/context.js';
import { UserRole } from '#src/graphql/enum.js';
import { SuccessResponse } from '#src/graphql/response/index.js';
import { UnauthenticatedError } from '#src/utils/errors.js';

import { Customer } from '#src/entity/customer/customer.entity.js';

import { User } from './user.entity.js';
import {
  UsersResponse,
  UserQueryArgs,
  SignUpInput,
  LoginInput,
  LoginResponse,
  TotpInput,
  TotpSetup,
  VerifyEmailInput,
  RequestPasswordResetInput,
  ResetPasswordInput,
  UpdatePasswordInput,
  UpdateProfileInput,
  CreateStaffUserInput,
  UpdateStaffUserInput,
} from './user.type.js';
import { UserService } from './user.service.js';
import { AuthService } from './auth.service.js';

@Service()
@Resolver(() => User)
export class UserResolver {
  constructor(
    private readonly service: UserService,
    private readonly auth: AuthService
  ) {}

  // Auth

  @Mutation(() => LoginResponse)
  async signUp(@Arg('data') data: SignUpInput, @Ctx() ctx: Context): Promise<LoginResponse> {
    return this.auth.signUp(data, ctx);
  }

  @Mutation(() => LoginResponse)
  async login(@Arg('data') data: LoginInput, @Ctx() ctx: Context): Promise<LoginResponse> {
    return this.auth.login(data, ctx);
  }

  @Mutation(() => LoginResponse)
  async verifyAdminTotp(@Arg('data') data: TotpInput, @Ctx() ctx: Context): Promise<LoginResponse> {
    return this.auth.verifyAdminTotp(data.mfaToken, data.code, ctx);
  }

  @Mutation(() => TotpSetup)
  async beginTotpSetup(@Arg('mfaToken', () => String) mfaToken: string): Promise<TotpSetup> {
    return this.auth.beginTotpSetup(mfaToken);
  }

  @Mutation(() => LoginResponse)
  async confirmTotpSetup(
    @Arg('data') data: TotpInput,
    @Ctx() ctx: Context
  ): Promise<LoginResponse> {
    return this.auth.confirmTotpSetup(data.mfaToken, data.code, ctx);
  }

  @Authorized()
  @Mutation(() => User)
  async verifyEmail(@Arg('data') data: VerifyEmailInput, @Ctx() ctx: Context): Promise<User> {
    return this.auth.verifyEmail(ctx.user!, data.code);
  }

  @Authorized()
  @Mutation(() => SuccessResponse)
  async resendVerification(@Ctx() ctx: Context): Promise<SuccessResponse> {
    await this.auth.resendVerification(ctx.user!);
    return { success: true };
  }

  @Mutation(() => SuccessResponse)
  async requestPasswordReset(
    @Arg('data') data: RequestPasswordResetInput,
    @Ctx() ctx: Context
  ): Promise<SuccessResponse> {
    await this.auth.requestPasswordReset(data.email, !!data.isAdmin, ctx);
    return { success: true };
  }

  @Mutation(() => SuccessResponse)
  async resetPassword(
    @Arg('data') data: ResetPasswordInput,
    @Ctx() ctx: Context
  ): Promise<SuccessResponse> {
    await this.auth.resetPassword(data.token, data.password, ctx);
    return { success: true };
  }

  @Authorized()
  @Mutation(() => LoginResponse)
  async updatePassword(
    @Arg('data') data: UpdatePasswordInput,
    @Ctx() ctx: Context
  ): Promise<LoginResponse> {
    return this.auth.updatePassword(ctx.user!, data.oldPassword, data.newPassword, ctx);
  }

  @Authorized()
  @Mutation(() => User)
  async updateProfile(@Arg('data') data: UpdateProfileInput, @Ctx() ctx: Context): Promise<User> {
    return this.service.updateUser(ctx.user!.id, { name: data.name.trim() });
  }

  @Authorized()
  @Query(() => User)
  async me(@Ctx() ctx: Context): Promise<User> {
    if (!ctx.user) throw new UnauthenticatedError();
    return ctx.user;
  }

  @FieldResolver(() => Customer, { nullable: true })
  async customer(@Root() user: User, @Ctx() ctx: Context) {
    if (ctx.user?.id === user.id && ctx.customer !== undefined) return ctx.customer;
    return ctx.dataLoader.get('customerByUserLoader').load(user.id);
  }

  // Staff management

  @Authorized([UserRole.Admin])
  @Query(() => UsersResponse)
  async staffUsers(
    @Args() query: UserQueryArgs,
    @Info() info: GraphQLResolveInfo
  ): Promise<UsersResponse> {
    const fields = graphqlFields(info);

    const [total, users] = await Promise.all([
      'total' in fields ? this.service.getStaffUsersCount(query) : undefined,
      'users' in fields ? this.service.getStaffUsers(query) : undefined,
    ]);

    return { total, users };
  }

  @Authorized([UserRole.Admin])
  @Mutation(() => User)
  async createStaffUser(
    @Arg('data') data: CreateStaffUserInput,
    @Ctx() ctx: Context
  ): Promise<User> {
    return this.auth.createStaffUser(data, ctx);
  }

  @Authorized([UserRole.Admin])
  @Mutation(() => User)
  async updateStaffUser(
    @Arg('data') data: UpdateStaffUserInput,
    @Ctx() ctx: Context
  ): Promise<User> {
    return this.auth.updateStaffUser(data, ctx);
  }

  @Authorized([UserRole.Admin])
  @Mutation(() => User)
  async resetStaffTotp(@Arg('id', () => Int) id: number, @Ctx() ctx: Context): Promise<User> {
    return this.auth.resetStaffTotp(id, ctx);
  }
}
