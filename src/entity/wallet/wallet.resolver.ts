import { Service } from 'typedi';
import {
  Arg,
  Authorized,
  Ctx,
  FieldResolver,
  Int,
  Mutation,
  Query,
  Resolver,
  Root,
  UseMiddleware,
} from 'type-graphql';

import { type Context } from '#src/context.js';
import { isStaff } from '#src/authChecker.js';
import { UserRole, WalletKeyStatus } from '#src/graphql/enum.js';
import { SuccessResponse } from '#src/graphql/response/index.js';
import { RequireActiveCustomer, assertOwnership } from '#src/graphql/middleware/index.js';
import { CustomerService } from '#src/entity/customer/customer.service.js';
import { AppError } from '#src/utils/errors.js';

import { Wallet } from './wallet.entity.js';
import {
  AddExternalWalletInput,
  ExportedWalletKey,
  RemoveWalletKeyInput,
  UpdateWalletLabelInput,
  WalletReauthInput,
} from './wallet.type.js';
import { WalletService } from './wallet.service.js';

@Service()
@Resolver(() => Wallet)
export class WalletResolver {
  constructor(
    private readonly service: WalletService,
    private readonly customers: CustomerService
  ) {}

  private async customer(ctx: Context) {
    return (await this.customers.getById(ctx.customer!.id))!;
  }

  /** Customers get their own wallets; staff pass `customerId`. */
  @Authorized()
  @Query(() => [Wallet])
  async wallets(
    @Ctx() ctx: Context,
    @Arg('customerId', () => Int, { nullable: true }) customerId?: number,
    @Arg('includeArchived', () => Boolean, { nullable: true }) includeArchived?: boolean
  ) {
    if (isStaff(ctx.user!.role)) {
      if (!customerId) throw new AppError('customerId is required', { field: 'customerId' });
      return this.service.listForCustomer(customerId, !!includeArchived);
    }
    if (!ctx.customer) return [];
    return this.service.listForCustomer(ctx.customer.id, !!includeArchived);
  }

  @Authorized()
  @Query(() => Wallet, { nullable: true })
  async wallet(@Arg('id', () => Int) id: number, @Ctx() ctx: Context) {
    const wallet = await this.service.getById(id);
    assertOwnership(ctx, wallet);
    return wallet;
  }

  @Authorized([UserRole.Customer])
  @UseMiddleware(RequireActiveCustomer)
  @Mutation(() => SuccessResponse, {
    description: 'Emails a code for adding wallets or changing the payout wallet',
  })
  async requestWalletChangeCode(@Ctx() ctx: Context): Promise<SuccessResponse> {
    await this.service.requestChangeCode(ctx.user!);
    return { success: true };
  }

  @Authorized([UserRole.Customer])
  @UseMiddleware(RequireActiveCustomer)
  @Mutation(() => Wallet)
  async addExternalWallet(@Arg('data') data: AddExternalWalletInput, @Ctx() ctx: Context) {
    return this.service.addExternal(ctx.user!, await this.customer(ctx), data, ctx);
  }

  @Authorized([UserRole.Customer])
  @UseMiddleware(RequireActiveCustomer)
  @Mutation(() => Wallet)
  async setPayoutWallet(@Arg('data') data: WalletReauthInput, @Ctx() ctx: Context) {
    return this.service.setPayout(
      ctx.user!,
      await this.customer(ctx),
      data.walletId,
      data.password,
      data.otp,
      ctx
    );
  }

  @Authorized([UserRole.Customer])
  @UseMiddleware(RequireActiveCustomer)
  @Mutation(() => Wallet)
  async archiveExternalWallet(@Arg('data') data: WalletReauthInput, @Ctx() ctx: Context) {
    return this.service.archiveExternal(
      ctx.user!,
      await this.customer(ctx),
      data.walletId,
      data.password,
      data.otp,
      ctx
    );
  }

  @Authorized([UserRole.Customer])
  @UseMiddleware(RequireActiveCustomer)
  @Mutation(() => Wallet)
  async updateWalletLabel(@Arg('data') data: UpdateWalletLabelInput, @Ctx() ctx: Context) {
    return this.service.updateLabel(await this.customer(ctx), data.walletId, data.label);
  }

  @Authorized([UserRole.Customer])
  @UseMiddleware(RequireActiveCustomer)
  @Mutation(() => SuccessResponse)
  async requestWalletKeyExport(@Arg('walletId', () => Int) walletId: number, @Ctx() ctx: Context) {
    await this.service.requestKeyExport(ctx.user!, await this.customer(ctx), walletId);
    return { success: true };
  }

  /** Customers only: staff roles can never export or remove keys. */
  @Authorized([UserRole.Customer])
  @UseMiddleware(RequireActiveCustomer)
  @Mutation(() => ExportedWalletKey)
  async exportWalletKey(
    @Arg('data') data: WalletReauthInput,
    @Ctx() ctx: Context
  ): Promise<ExportedWalletKey> {
    ctx.res.setHeader('Cache-Control', 'no-store, private');
    ctx.res.setHeader('Pragma', 'no-cache');
    return this.service.exportKey(
      ctx.user!,
      await this.customer(ctx),
      data.walletId,
      data.password,
      data.otp,
      ctx
    );
  }

  @Authorized([UserRole.Customer])
  @UseMiddleware(RequireActiveCustomer)
  @Mutation(() => Wallet)
  async removeWalletKey(@Arg('data') data: RemoveWalletKeyInput, @Ctx() ctx: Context) {
    return this.service.removeKey(
      ctx.user!,
      await this.customer(ctx),
      data.walletId,
      data.password,
      ctx
    );
  }

  @FieldResolver(() => Boolean)
  async isPayout(@Root() wallet: Wallet, @Ctx() ctx: Context) {
    const customer = await ctx.dataLoader.get('customerLoader').load(wallet.customerId);
    return customer?.payoutWalletId === wallet.id;
  }

  @FieldResolver(() => WalletKeyStatus)
  async keyStatus(@Root() wallet: Wallet, @Ctx() ctx: Context) {
    const hasKey = await ctx.dataLoader.get('walletHasKeyLoader').load(wallet.id);
    return this.service.keyStatus(wallet as any, hasKey);
  }
}
