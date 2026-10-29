import { Service } from 'typedi';
import {
  Arg,
  Args,
  Authorized,
  Ctx,
  FieldResolver,
  ID,
  Info,
  Mutation,
  Query,
  Resolver,
  Root,
  UseMiddleware,
} from 'type-graphql';
import { GraphQLJSON } from 'graphql-type-json';
import graphqlFields from 'graphql-fields';
import type { GraphQLResolveInfo } from 'graphql';

import { type Context } from '#src/context.js';
import { TransactionState, UserRole } from '#src/graphql/enum.js';
import { CustomerScope, StaffOnlyField, assertOwnership } from '#src/graphql/middleware/index.js';
import { Customer } from '#src/entity/customer/customer.entity.js';
import { VirtualAccount } from '#src/entity/virtualAccount/virtualAccount.entity.js';
import { FeeSchedule } from '#src/entity/fee/fee.entity.js';
import { explorerTxUrl } from '#src/utils/explorer.js';

import { Transaction, TransactionEvent } from './transaction.entity.js';
import {
  SimulateDepositInput,
  TransactionQueryArgs,
  TransactionsResponse,
} from './transaction.type.js';
import { TransactionService } from './transaction.service.js';
import { PayoutService, type WalletSnapshot } from './payout.service.js';
import { SandboxService } from './sandbox.service.js';

@Service()
@Resolver(() => Transaction)
export class TransactionResolver {
  constructor(
    private readonly service: TransactionService,
    private readonly payouts: PayoutService,
    private readonly sandbox: SandboxService
  ) {}

  @Authorized()
  @UseMiddleware(CustomerScope)
  @Query(() => TransactionsResponse)
  async transactions(
    @Args() query: TransactionQueryArgs,
    @Info() info: GraphQLResolveInfo
  ): Promise<TransactionsResponse> {
    const fields = graphqlFields(info);
    const [total, transactions] = await Promise.all([
      'total' in fields ? this.service.count(query) : undefined,
      'transactions' in fields ? this.service.list(query) : undefined,
    ]);
    return { total, transactions };
  }

  @Authorized()
  @Query(() => Transaction, { nullable: true })
  async transaction(
    @Arg('id', () => ID, { description: 'UUID or reference (NXP-…)' }) id: string,
    @Ctx() ctx: Context
  ) {
    const tx = await this.service.getByIdOrReference(id);
    assertOwnership(ctx, tx);
    return tx;
  }

  @Authorized([UserRole.Admin])
  @Mutation(() => Transaction)
  async retryPayout(@Arg('id', () => ID) id: string, @Ctx() ctx: Context) {
    return this.payouts.adminRetry(id, ctx);
  }

  @Authorized([UserRole.Admin])
  @Mutation(() => Transaction, { nullable: true, description: 'Bridge sandbox only' })
  async simulateDeposit(@Arg('input') input: SimulateDepositInput, @Ctx() ctx: Context) {
    return this.sandbox.simulateDeposit(input, ctx);
  }

  @FieldResolver(() => [TransactionEvent])
  async events(@Root() tx: Transaction, @Ctx() ctx: Context) {
    return ctx.dataLoader.get('transactionEventsLoader').load(tx.id);
  }

  @FieldResolver(() => String, { nullable: true })
  explorerUrl(@Root() tx: Transaction) {
    const wallet = tx.destinationWalletSnapshot as WalletSnapshot | null;
    return explorerTxUrl(wallet?.chain, tx.txHash);
  }

  @FieldResolver(() => Boolean, { description: 'Admin can trigger a manual payout retry' })
  canRetry(@Root() tx: Transaction) {
    return (
      tx.state === TransactionState.PayoutFailed &&
      !/below the minimum/.test(tx.failureReason ?? '')
    );
  }

  @FieldResolver(() => Customer, { nullable: true })
  async customer(@Root() tx: Transaction, @Ctx() ctx: Context) {
    return ctx.dataLoader.get('customerLoader').load(tx.customerId);
  }

  @FieldResolver(() => VirtualAccount, { nullable: true })
  async virtualAccount(@Root() tx: Transaction, @Ctx() ctx: Context) {
    return tx.virtualAccountId
      ? ctx.dataLoader.get('virtualAccountLoader').load(tx.virtualAccountId)
      : null;
  }

  @FieldResolver(() => FeeSchedule, { nullable: true })
  async feeSchedule(@Root() tx: Transaction, @Ctx() ctx: Context) {
    return tx.feeScheduleId ? ctx.dataLoader.get('feeScheduleLoader').load(tx.feeScheduleId) : null;
  }

  @UseMiddleware(StaffOnlyField)
  @FieldResolver(() => String, { nullable: true })
  bridgeDepositId(@Root() tx: Transaction) {
    return tx.bridgeDepositId;
  }

  @UseMiddleware(StaffOnlyField)
  @FieldResolver(() => String, { nullable: true })
  bridgeTransferId(@Root() tx: Transaction) {
    return tx.bridgeTransferId ?? null;
  }
}

@Service()
@Resolver(() => TransactionEvent)
export class TransactionEventResolver {
  @UseMiddleware(StaffOnlyField)
  @FieldResolver(() => GraphQLJSON, { nullable: true, description: 'Raw Bridge or system payload' })
  payload(@Root() event: TransactionEvent) {
    return event.payload ?? null;
  }
}
