import { Service } from 'typedi';
import { and } from '@prisma/orm-postgres/orm-client';

import { config } from '#src/config.js';
import {
  PrismaService,
  type CustomerRow,
  type FeeScheduleRow,
  type FeeTierRow,
} from '#src/service/prisma.js';
import { QueueService } from '#src/service/queue.js';
import { MailerService } from '#src/service/mailer.js';
import { CustomerStatus, FeeScheduleStatus, FiatCurrency } from '#src/graphql/enum.js';
import { AuditLogService } from '#src/entity/auditLog/auditLog.service.js';
import { AppSettingService } from '#src/entity/appSetting/appSetting.service.js';
import { MonthlyVolumeService } from '#src/entity/monthlyVolume/monthlyVolume.service.js';
import { AppError, NotFoundError, isSqlError } from '#src/utils/errors.js';
import { bpsToPercent, divideByDecimal, formatRange } from '#src/utils/money.js';
import { comparePeriods, currentPeriodKey, formatPeriod, isPeriodKey } from '#src/utils/period.js';
import type { Context } from '#src/context.js';

import { calculateTieredFee, effectiveRateBps, type Tier } from './fee.engine.js';
import {
  earliestEffectivePeriod,
  effectivePeriodSchema,
  feeTiersSchema,
  type FeeTierValue,
} from './fee.validation.js';
import { FxRateService } from './fxRate.service.js';
import type {
  CreateFeeScheduleDraftInput,
  FeeQuote,
  FeeScheduleQueryArgs,
  FeeTierInput,
  UpdateFeeScheduleDraftInput,
} from './fee.type.js';

export const NOTIFY_FEE_SCHEDULE = 'notify-fee-schedule';
export const SOFT_CAP_KEY = 'fee.softCapBps';

const LIVE_STATUSES = [
  FeeScheduleStatus.Scheduled,
  FeeScheduleStatus.Active,
  FeeScheduleStatus.Superseded,
];

const SCHEDULE_LIST = {
  model: 'FeeSchedule',
  filterable: ['id', 'effectivePeriod', 'status', 'createdById', 'publishedById', 'createdAt'],
  sortable: ['id', 'effectivePeriod', 'createdAt', 'publishedAt'],
  defaultSort: 'effectivePeriod',
} as const;

export interface ResolvedSchedule {
  schedule: FeeScheduleRow;
  tiers: Tier[];
}

const toTier = (row: FeeTierRow): Tier => ({
  position: row.position,
  fromInCents: row.fromInCents,
  toInCents: row.toInCents,
  rateBps: row.rateBps,
});

/** Global fee schedules. Which one applies is decided only by `effectivePeriod`. */
@Service()
export class FeeScheduleService {
  private readonly cache = new Map<string, ResolvedSchedule>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly volumes: MonthlyVolumeService,
    private readonly fx: FxRateService,
    private readonly settings: AppSettingService,
    private readonly audit: AuditLogService,
    private readonly queue: QueueService,
    private readonly mailer: MailerService
  ) {}

  clearCache() {
    this.cache.clear();
  }

  // Reads

  async list(query: FeeScheduleQueryArgs) {
    return query.applyTo(this.prisma.orm.FeeSchedule, SCHEDULE_LIST).all();
  }

  async count(query: FeeScheduleQueryArgs) {
    const { total } = await query
      .applyFilter(this.prisma.orm.FeeSchedule, SCHEDULE_LIST)
      .aggregate((a) => ({ total: a.count() }));
    return Number(total);
  }

  async getById(id: number) {
    return this.prisma.orm.FeeSchedule.where({ id }).first();
  }

  async tiersOf(scheduleId: number): Promise<FeeTierRow[]> {
    return this.prisma.orm.FeeTier.where({ feeScheduleId: scheduleId })
      .orderBy((t) => t.position.asc())
      .all();
  }

  /** The published schedule with the latest `effectivePeriod` not after `periodKey`. Cached. */
  async getForPeriod(periodKey: string): Promise<ResolvedSchedule> {
    const cached = this.cache.get(periodKey);
    if (cached) return cached;
    const schedule = await this.prisma.orm.FeeSchedule.where((s) =>
      and(s.status.in(LIVE_STATUSES), s.effectivePeriod.lte(periodKey))
    )
      .orderBy((s) => s.effectivePeriod.desc())
      .first();
    if (!schedule) throw new Error(`No fee schedule in effect for ${periodKey}`);
    const resolved = { schedule, tiers: (await this.tiersOf(schedule.id)).map(toTier) };
    this.cache.set(periodKey, resolved);
    return resolved;
  }

  async current() {
    return (await this.getForPeriod(currentPeriodKey())).schedule;
  }

  async upcoming() {
    return this.prisma.orm.FeeSchedule.where((s) =>
      and(s.status.eq(FeeScheduleStatus.Scheduled), s.effectivePeriod.gt(currentPeriodKey()))
    )
      .orderBy((s) => s.effectivePeriod.asc())
      .first();
  }

  async softCapBps() {
    return this.settings.get<number>(SOFT_CAP_KEY, 2000);
  }

  // Quotes

  /** Fee for a hypothetical deposit; logged-in customers start from this month's volume. */
  async quote(
    amountInCents: bigint,
    currency: FiatCurrency,
    customer?: CustomerRow | null
  ): Promise<FeeQuote> {
    if (amountInCents <= 0n)
      throw new AppError('Enter an amount above zero', { field: 'amountInCents' });
    if (amountInCents > 100_000_000_000n)
      throw new AppError('Amount is too large', { field: 'amountInCents' });
    const periodKey = currentPeriodKey();
    const { schedule, tiers } = await this.getForPeriod(periodKey);
    const prevVolumeInCents = customer ? await this.volumes.volumeOf(customer.id, periodKey) : 0n;
    const { usdInCents, fxRate } = await this.fx.toUsd(amountInCents, currency);
    const result = calculateTieredFee(prevVolumeInCents, usdInCents, tiers);
    const feeInCents = fxRate ? divideByDecimal(result.feeInCents, fxRate) : result.feeInCents;
    return {
      currency,
      amountInCents,
      usdEquivalentInCents: usdInCents,
      fxRate,
      prevVolumeInCents,
      feeUsdInCents: result.feeInCents,
      feeInCents,
      netInCents: amountInCents - feeInCents,
      effectiveRateBps: effectiveRateBps(result.feeInCents, usdInCents),
      breakdown: result.breakdown,
      schedule,
      periodKey,
    };
  }

  // Admin: drafts, publish, cancel

  private validateTiers(input: FeeTierInput[] | FeeTierValue[]): FeeTierValue[] {
    const tiers = input.map((t) => ({
      fromInCents: BigInt(t.fromInCents),
      toInCents: t.toInCents === null || t.toInCents === undefined ? null : BigInt(t.toInCents),
      rateBps: t.rateBps,
    }));
    const parsed = feeTiersSchema.safeParse(tiers);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      const field = issue.path.length ? `tiers.${issue.path.join('.')}` : 'tiers';
      throw new AppError(issue.message, { field });
    }
    return parsed.data;
  }

  private validatePeriod(periodKey: string) {
    const parsed = effectivePeriodSchema().safeParse(periodKey);
    if (!parsed.success)
      throw new AppError(parsed.error.issues[0]!.message, { field: 'effectivePeriod' });
    return parsed.data;
  }

  private async replaceTiers(scheduleId: number, tiers: FeeTierValue[]) {
    await this.prisma.orm.FeeTier.where({ feeScheduleId: scheduleId }).deleteAll();
    await this.prisma.orm.FeeTier.createAll(
      tiers.map((t, position) => ({ feeScheduleId: scheduleId, position, ...t }))
    );
  }

  private snapshot(tiers: { fromInCents: bigint; toInCents: bigint | null; rateBps: number }[]) {
    return tiers.map((t) => ({
      from: t.fromInCents.toString(),
      to: t.toInCents?.toString() ?? null,
      rateBps: t.rateBps,
    }));
  }

  async createDraft(input: CreateFeeScheduleDraftInput, ctx: Context) {
    const source = input.tiers?.length
      ? input.tiers
      : (await this.getForPeriod(currentPeriodKey())).tiers;
    const tiers = this.validateTiers(source);
    const effectivePeriod = input.effectivePeriod ?? earliestEffectivePeriod();
    if (!isPeriodKey(effectivePeriod))
      throw new AppError('Choose a month', { field: 'effectivePeriod' });

    const schedule = await this.prisma.transaction(async () => {
      const created = await this.prisma.orm.FeeSchedule.create({
        effectivePeriod,
        status: FeeScheduleStatus.Draft,
        notes: input.notes?.trim() || null,
        createdById: ctx.user!.id,
      });
      await this.replaceTiers(created.id, tiers);
      return created;
    });
    await this.audit.log(ctx, {
      action: 'feeSchedule.createDraft',
      entity: 'FeeSchedule',
      entityId: schedule.id,
      after: { effectivePeriod, tiers: this.snapshot(tiers) },
    });
    return schedule;
  }

  private async editable(id: number) {
    const schedule = await this.getById(id);
    if (!schedule) throw new NotFoundError('Fee schedule');
    if (schedule.status === FeeScheduleStatus.Draft) return schedule;
    if (
      schedule.status === FeeScheduleStatus.Scheduled &&
      comparePeriods(schedule.effectivePeriod, currentPeriodKey()) > 0
    ) {
      return schedule;
    }
    throw new AppError(
      'Active and past schedules cannot be changed. Create a new draft for a later month.'
    );
  }

  async updateDraft(input: UpdateFeeScheduleDraftInput, ctx: Context) {
    const schedule = await this.editable(input.id);
    const beforeTiers = await this.tiersOf(schedule.id);
    const tiers = input.tiers ? this.validateTiers(input.tiers) : undefined;

    let effectivePeriod = schedule.effectivePeriod;
    if (input.effectivePeriod && input.effectivePeriod !== schedule.effectivePeriod) {
      if (!isPeriodKey(input.effectivePeriod))
        throw new AppError('Choose a month', { field: 'effectivePeriod' });
      // Drafts may hold any month until publish; scheduled ones must stay in the future
      if (schedule.status === FeeScheduleStatus.Scheduled)
        this.validatePeriod(input.effectivePeriod);
      effectivePeriod = input.effectivePeriod;
    }

    const updated = await this.prisma.transaction(async () => {
      const row = await this.prisma.orm.FeeSchedule.where({ id: schedule.id }).update({
        effectivePeriod,
        ...(input.notes !== undefined && { notes: input.notes.trim() || null }),
        ...(input.notifyCustomers !== undefined && { notifyCustomers: input.notifyCustomers }),
      });
      if (tiers) await this.replaceTiers(schedule.id, tiers);
      return row!;
    });
    this.clearCache();
    await this.audit.log(ctx, {
      action: 'feeSchedule.updateDraft',
      entity: 'FeeSchedule',
      entityId: schedule.id,
      before: { effectivePeriod: schedule.effectivePeriod, tiers: this.snapshot(beforeTiers) },
      after: { effectivePeriod, tiers: tiers ? this.snapshot(tiers) : undefined },
    });
    return updated;
  }

  async publish(
    id: number,
    effectivePeriod: string,
    notifyCustomers: boolean | undefined,
    ctx: Context
  ) {
    const schedule = await this.getById(id);
    if (!schedule) throw new NotFoundError('Fee schedule');
    if (schedule.status !== FeeScheduleStatus.Draft)
      throw new AppError('Only drafts can be published');
    const period = this.validatePeriod(effectivePeriod);
    const tiers = this.validateTiers(await this.tiersOf(id));

    let published: FeeScheduleRow;
    try {
      published = (await this.prisma.orm.FeeSchedule.where({
        id,
        status: FeeScheduleStatus.Draft,
      }).update({
        status: FeeScheduleStatus.Scheduled,
        effectivePeriod: period,
        publishedById: ctx.user!.id,
        publishedAt: new Date(),
        notifyCustomers: notifyCustomers ?? schedule.notifyCustomers,
      }))!;
    } catch (error) {
      if (isSqlError(error, '23505')) {
        throw new AppError(
          `A schedule is already published for ${formatPeriod(period)}. Cancel it first.`,
          {
            field: 'effectivePeriod',
          }
        );
      }
      throw error;
    }
    if (!published) throw new AppError('Only drafts can be published');
    this.clearCache();

    await this.audit.log(ctx, {
      action: 'feeSchedule.publish',
      entity: 'FeeSchedule',
      entityId: id,
      before: { status: schedule.status },
      after: { status: published.status, effectivePeriod: period, tiers: this.snapshot(tiers) },
    });
    if (published.notifyCustomers)
      await this.queue.sendSafe(NOTIFY_FEE_SCHEDULE, { scheduleId: id });
    return published;
  }

  async cancel(id: number, ctx: Context) {
    const schedule = await this.editable(id);
    const updated = (await this.prisma.orm.FeeSchedule.where({ id }).update({
      status: FeeScheduleStatus.Cancelled,
      cancelledAt: new Date(),
    }))!;
    this.clearCache();
    await this.audit.log(ctx, {
      action: 'feeSchedule.cancel',
      entity: 'FeeSchedule',
      entityId: id,
      before: { status: schedule.status, effectivePeriod: schedule.effectivePeriod },
      after: { status: updated.status },
    });
    return updated;
  }

  async setSoftCap(softCapBps: number, ctx: Context) {
    if (!Number.isInteger(softCapBps) || softCapBps < 0 || softCapBps > 10_000) {
      throw new AppError('Soft cap must be between 0 and 10,000 bps', { field: 'softCapBps' });
    }
    const before = await this.softCapBps();
    await this.settings.set(SOFT_CAP_KEY, softCapBps);
    await this.audit.log(ctx, {
      action: 'feeSettings.update',
      entity: 'AppSetting',
      entityId: SOFT_CAP_KEY,
      before,
      after: softCapBps,
    });
  }

  // Jobs

  /**
   * Month-start status housekeeping (display only): the schedule in effect becomes
   * Active and older Active/Scheduled ones become Superseded. Idempotent.
   */
  async rollover() {
    this.clearCache();
    const { schedule } = await this.getForPeriod(currentPeriodKey());
    if (schedule.status !== FeeScheduleStatus.Active) {
      await this.prisma.orm.FeeSchedule.where({ id: schedule.id }).update({
        status: FeeScheduleStatus.Active,
      });
    }
    const older = await this.prisma.orm.FeeSchedule.where((s) =>
      and(
        s.status.in([FeeScheduleStatus.Active, FeeScheduleStatus.Scheduled]),
        s.effectivePeriod.lt(schedule.effectivePeriod)
      )
    ).all();
    for (const row of older) {
      await this.prisma.orm.FeeSchedule.where({ id: row.id }).update({
        status: FeeScheduleStatus.Superseded,
      });
    }
    this.clearCache();
    if (schedule.status !== FeeScheduleStatus.Active || older.length) {
      console.info(
        `[fee] schedule ${schedule.id} active for ${schedule.effectivePeriod}; superseded ${older.length}`
      );
    }
  }

  /** Emails active customers about a published schedule. */
  async notifyCustomers(scheduleId: number) {
    const schedule = await this.getById(scheduleId);
    if (!schedule || schedule.status !== FeeScheduleStatus.Scheduled) return 0;
    const tiers = await this.tiersOf(scheduleId);
    const rows = tiers.map((t) => [
      formatRange(t.fromInCents, t.toInCents),
      bpsToPercent(t.rateBps),
    ]);

    let sent = 0;
    let lastId = 0;
    for (;;) {
      const customers = await this.prisma.orm.Customer.where((c) =>
        and(c.status.eq(CustomerStatus.Active), c.id.gt(lastId))
      )
        .orderBy((c) => c.id.asc())
        .limit(200)
        .select('id', 'userId')
        .all();
      if (customers.length === 0) break;
      lastId = customers[customers.length - 1]!.id;
      const users = await this.prisma.orm.User.where((u) => u.id.in(customers.map((c) => c.userId)))
        .select('email', 'name')
        .all();
      for (const user of users) {
        await this.mailer.send({
          to: user.email,
          subject: `NxPay fees are changing in ${formatPeriod(schedule.effectivePeriod)}`,
          template: 'fee-schedule-published',
          locals: {
            name: user.name,
            periodLabel: formatPeriod(schedule.effectivePeriod),
            tiers: rows,
            notes: schedule.notes,
          },
        });
        sent++;
      }
    }
    return sent;
  }

  get minimumPayoutInCents() {
    return config.BRIDGE_MIN_TRANSFER_IN_CENTS;
  }
}
