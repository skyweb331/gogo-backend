import { Service } from 'typedi';
import {
  Arg,
  Args,
  Authorized,
  Ctx,
  FieldResolver,
  Info,
  Int,
  Mutation,
  ObjectType,
  Field,
  Query,
  Resolver,
  Root,
  UseMiddleware,
} from 'type-graphql';
import graphqlFields from 'graphql-fields';
import type { GraphQLResolveInfo } from 'graphql';

import { type Context } from '#src/context.js';
import { FiatCurrency, UserRole } from '#src/graphql/enum.js';
import { GraphQLBigInt } from '#src/graphql/scalar/index.js';
import { SuccessResponse } from '#src/graphql/response/index.js';
import { CustomerScope, RequireCustomer, StaffOnlyField } from '#src/graphql/middleware/index.js';
import { User } from '#src/entity/user/user.entity.js';
import { MonthlyVolumeService } from '#src/entity/monthlyVolume/monthlyVolume.service.js';
import {
  MonthlyVolumeQueryArgs,
  MonthlyVolumesResponse,
} from '#src/entity/monthlyVolume/monthlyVolume.type.js';
import { currentPeriodKey } from '#src/utils/period.js';

import { FeeSchedule, FeeTier } from './fee.entity.js';
import {
  CreateFeeScheduleDraftInput,
  FeeQuote,
  FeeScheduleQueryArgs,
  FeeSchedulesResponse,
  FeeSettings,
  PublishFeeScheduleInput,
  UpdateFeeScheduleDraftInput,
  UpdateFeeSettingsInput,
} from './fee.type.js';
import { earliestEffectivePeriod } from './fee.validation.js';
import { FeeScheduleService } from './feeSchedule.service.js';

@ObjectType()
export class FeeProgress {
  @Field(() => String)
  periodKey: string;

  @Field(() => GraphQLBigInt)
  volumeInCents: bigint;

  @Field(() => GraphQLBigInt)
  feeInCents: bigint;

  @Field(() => Int)
  txCount: number;

  @Field(() => FeeTier, { description: 'Tier the next dollar falls into' })
  currentTier: FeeTier;

  @Field(() => FeeTier, { nullable: true })
  nextTier?: FeeTier | null;

  @Field(() => FeeSchedule)
  schedule: FeeSchedule;
}

@Service()
@Resolver(() => FeeSchedule)
export class FeeResolver {
  constructor(
    private readonly service: FeeScheduleService,
    private readonly volumes: MonthlyVolumeService
  ) {}

  // Public

  @Query(() => FeeSchedule, { description: 'Schedule in effect this month' })
  async currentFeeSchedule() {
    return this.service.current();
  }

  @Query(() => FeeSchedule, { nullable: true, description: 'Next published schedule, if any' })
  async upcomingFeeSchedule() {
    return this.service.upcoming();
  }

  @Query(() => FeeQuote, {
    description: 'Starts from this month’s volume when called by a customer',
  })
  async feeQuote(
    @Arg('amountInCents', () => GraphQLBigInt) amountInCents: bigint,
    @Arg('currency', () => FiatCurrency, { defaultValue: FiatCurrency.usd }) currency: FiatCurrency,
    @Ctx() ctx: Context
  ): Promise<FeeQuote> {
    return this.service.quote(amountInCents, currency, ctx.customer);
  }

  // Customer

  @Authorized([UserRole.Customer])
  @UseMiddleware(RequireCustomer)
  @Query(() => FeeProgress)
  async feeProgress(@Ctx() ctx: Context): Promise<FeeProgress> {
    const periodKey = currentPeriodKey();
    const [{ schedule, tiers }, volume] = await Promise.all([
      this.service.getForPeriod(periodKey),
      this.volumes.get(ctx.customer!.id, periodKey),
    ]);
    const tierRows = await this.service.tiersOf(schedule.id);
    const volumeInCents = volume?.volumeInCents ?? 0n;
    const index = Math.max(
      0,
      tiers.findIndex(
        (t) =>
          volumeInCents >= t.fromInCents && (t.toInCents === null || volumeInCents < t.toInCents)
      )
    );
    return {
      periodKey,
      volumeInCents,
      feeInCents: volume?.feeInCents ?? 0n,
      txCount: volume?.txCount ?? 0,
      currentTier: tierRows[index]!,
      nextTier: tierRows[index + 1] ?? null,
      schedule,
    };
  }

  @Authorized()
  @UseMiddleware(CustomerScope)
  @Query(() => MonthlyVolumesResponse)
  async monthlyVolumes(
    @Args() query: MonthlyVolumeQueryArgs,
    @Info() info: GraphQLResolveInfo
  ): Promise<MonthlyVolumesResponse> {
    const fields = graphqlFields(info);
    const [total, monthlyVolumes] = await Promise.all([
      'total' in fields ? this.volumes.count(query) : undefined,
      'monthlyVolumes' in fields ? this.volumes.list(query) : undefined,
    ]);
    return { total, monthlyVolumes };
  }

  // Staff (Support can view, Admin edits)

  @Authorized([UserRole.Support])
  @Query(() => FeeSchedulesResponse)
  async feeSchedules(
    @Args() query: FeeScheduleQueryArgs,
    @Info() info: GraphQLResolveInfo
  ): Promise<FeeSchedulesResponse> {
    const fields = graphqlFields(info);
    const [total, feeSchedules] = await Promise.all([
      'total' in fields ? this.service.count(query) : undefined,
      'feeSchedules' in fields ? this.service.list(query) : undefined,
    ]);
    return { total, feeSchedules };
  }

  @Authorized([UserRole.Support])
  @Query(() => FeeSchedule, { nullable: true })
  async feeSchedule(@Arg('id', () => Int) id: number) {
    return this.service.getById(id);
  }

  @Authorized([UserRole.Support])
  @Query(() => FeeSettings)
  async feeSettings(): Promise<FeeSettings> {
    return {
      softCapBps: await this.service.softCapBps(),
      earliestEffectivePeriod: earliestEffectivePeriod(),
      minimumPayoutInCents: this.service.minimumPayoutInCents,
    };
  }

  @Authorized([UserRole.Admin])
  @Mutation(() => FeeSettings)
  async updateFeeSettings(
    @Arg('data') data: UpdateFeeSettingsInput,
    @Ctx() ctx: Context
  ): Promise<FeeSettings> {
    await this.service.setSoftCap(data.softCapBps, ctx);
    return this.feeSettings();
  }

  @Authorized([UserRole.Admin])
  @Mutation(() => FeeSchedule)
  async createFeeScheduleDraft(
    @Arg('data') data: CreateFeeScheduleDraftInput,
    @Ctx() ctx: Context
  ) {
    return this.service.createDraft(data, ctx);
  }

  @Authorized([UserRole.Admin])
  @Mutation(() => FeeSchedule)
  async updateFeeScheduleDraft(
    @Arg('data') data: UpdateFeeScheduleDraftInput,
    @Ctx() ctx: Context
  ) {
    return this.service.updateDraft(data, ctx);
  }

  @Authorized([UserRole.Admin])
  @Mutation(() => FeeSchedule)
  async publishFeeSchedule(@Arg('data') data: PublishFeeScheduleInput, @Ctx() ctx: Context) {
    return this.service.publish(data.id, data.effectivePeriod, data.notifyCustomers, ctx);
  }

  @Authorized([UserRole.Admin])
  @Mutation(() => FeeSchedule)
  async cancelFeeSchedule(@Arg('id', () => Int) id: number, @Ctx() ctx: Context) {
    return this.service.cancel(id, ctx);
  }

  @Authorized([UserRole.Admin])
  @Mutation(() => SuccessResponse, { description: 'Re-runs the month-start status update' })
  async rolloverFeeSchedules(): Promise<SuccessResponse> {
    await this.service.rollover();
    return { success: true };
  }

  // Fields

  @FieldResolver(() => [FeeTier])
  async tiers(@Root() schedule: FeeSchedule, @Ctx() ctx: Context) {
    return ctx.dataLoader.get('feeTiersLoader').load(schedule.id);
  }

  @UseMiddleware(StaffOnlyField)
  @FieldResolver(() => User, { nullable: true })
  async createdBy(@Root() schedule: FeeSchedule, @Ctx() ctx: Context) {
    return schedule.createdById
      ? ctx.dataLoader.get('userLoader').load(schedule.createdById)
      : null;
  }

  @UseMiddleware(StaffOnlyField)
  @FieldResolver(() => User, { nullable: true })
  async publishedBy(@Root() schedule: FeeSchedule, @Ctx() ctx: Context) {
    return schedule.publishedById
      ? ctx.dataLoader.get('userLoader').load(schedule.publishedById)
      : null;
  }
}
