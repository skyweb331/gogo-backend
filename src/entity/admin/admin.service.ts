import { randomUUID } from 'node:crypto';
import { Service } from 'typedi';
import { and } from '@prisma/orm-postgres/orm-client';

import { PrismaService } from '#src/service/prisma.js';
import { BridgeApiError, BridgeService } from '#src/service/bridge/index.js';
import type { FeeExternalAccount } from '#src/service/bridge/developer.js';
import {
  CustomerStatus,
  KycStatus,
  TicketStatus,
  TransactionState,
  WebhookEventStatus,
} from '#src/graphql/enum.js';
import { AuditLogService } from '#src/entity/auditLog/auditLog.service.js';
import type { Context } from '#src/context.js';
import { AppError } from '#src/utils/errors.js';
import { currentPeriodKey } from '#src/utils/period.js';

import type {
  ConfigureFeeExternalAccountInput,
  DashboardStats,
  FeeExternalAccountInfo,
} from './admin.type.js';

const PENDING_KYC: string[] = [
  KycStatus.incomplete,
  KycStatus.under_review,
  KycStatus.awaiting_ubo,
  KycStatus.awaiting_questionnaire,
  KycStatus.paused,
];
const DAY_MS = 24 * 60 * 60_000;

const big = (value: unknown) => BigInt(String(value ?? 0).split('.')[0] || '0');

const toInfo = (account: FeeExternalAccount): FeeExternalAccountInfo => ({
  id: account.id,
  accountOwnerName: account.account_owner_name,
  bankName: account.bank_name ?? null,
  last4: account.last_4 ?? account.account?.last_4 ?? null,
  active: account.active,
  updatedAt: account.updated_at ? new Date(account.updated_at) : null,
});

@Service()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bridge: BridgeService,
    private readonly audit: AuditLogService
  ) {}

  async dashboardStats(): Promise<DashboardStats> {
    const periodKey = currentPeriodKey();
    const orm = this.prisma.orm;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = async (q: { aggregate: (fn: (a: any) => any) => Promise<any> }) =>
      Number((await q.aggregate((a) => ({ n: a.count() }))).n);

    const since = new Date(Math.floor((Date.now() - 29 * DAY_MS) / DAY_MS) * DAY_MS);
    const [
      volume,
      active,
      onboarding,
      pendingKyc,
      failed,
      inFlight,
      openTickets,
      failedWebhooks,
      recent,
    ] = await Promise.all([
      orm.MonthlyVolume.where({ periodKey }).aggregate((a) => ({
        volume: a.sum('volumeInCents'),
        fees: a.sum('feeInCents'),
        count: a.sum('txCount'),
      })),
      count(orm.Customer.where({ status: CustomerStatus.Active })),
      count(orm.Customer.where({ status: CustomerStatus.Onboarding })),
      count(
        orm.Customer.where((c) =>
          and(c.status.eq(CustomerStatus.Onboarding), c.kycStatus.in(PENDING_KYC))
        )
      ),
      count(orm.Transaction.where({ state: TransactionState.PayoutFailed })),
      count(
        orm.Transaction.where((t) =>
          t.state.in([
            TransactionState.Credited,
            TransactionState.PayoutPending,
            TransactionState.PayoutSubmitted,
          ])
        )
      ),
      count(orm.SupportTicket.where((t) => t.status.in([TicketStatus.Open, TicketStatus.Pending]))),
      count(orm.WebhookEvent.where({ status: WebhookEventStatus.Failed })),
      orm.Transaction.where((t) => t.fundsReceivedAt.gte(since))
        .select('fundsReceivedAt', 'usdEquivalentInCents', 'grossAmountInCents')
        .limit(20_000)
        .all(),
    ]);

    const byDay = new Map<string, { volumeInCents: bigint; count: number }>();
    for (let i = 0; i < 30; i++) {
      byDay.set(new Date(since.getTime() + i * DAY_MS).toISOString().slice(0, 10), {
        volumeInCents: 0n,
        count: 0,
      });
    }
    for (const row of recent) {
      const day = byDay.get(row.fundsReceivedAt!.toISOString().slice(0, 10));
      if (!day) continue;
      day.volumeInCents += row.usdEquivalentInCents ?? row.grossAmountInCents;
      day.count += 1;
    }

    return {
      periodKey,
      volumeInCents: big(volume.volume),
      feesInCents: big(volume.fees),
      depositCount: Number(volume.count ?? 0),
      activeCustomers: active,
      onboardingCustomers: onboarding,
      pendingKyc,
      failedPayouts: failed,
      inFlightPayouts: inFlight,
      openTickets,
      failedWebhooks,
      daily: [...byDay].map(([date, d]) => ({ date, ...d })),
    };
  }

  async feeExternalAccount(): Promise<FeeExternalAccountInfo | null> {
    if (!this.bridge.configured) return null;
    try {
      return toInfo(await this.bridge.developer.getFeeExternalAccount());
    } catch (error) {
      if (error instanceof BridgeApiError && error.status === 404) return null;
      throw error;
    }
  }

  async configureFeeExternalAccount(input: ConfigureFeeExternalAccountInput, ctx: Context) {
    if (!this.bridge.configured) throw new AppError('Bridge API key is not configured');
    let account: FeeExternalAccount;
    try {
      account = await this.bridge.developer.configureFeeExternalAccount(
        input,
        `fee-account-${randomUUID()}`
      );
    } catch (error) {
      if (error instanceof BridgeApiError && !error.retryable) throw new AppError(error.message);
      throw error;
    }
    const info = toInfo(account);
    await this.audit.log(ctx, {
      action: 'bridge.configureFeeExternalAccount',
      entity: 'FeeExternalAccount',
      entityId: info.id,
      after: {
        bankName: info.bankName,
        accountOwnerName: info.accountOwnerName,
        last4: info.last4,
      },
    });
    return info;
  }
}
