import { createHash } from 'node:crypto';
import { Service } from 'typedi';
import { and, not, or } from '@prisma/orm-postgres/orm-client';

import { config, isBridgeSandbox } from '#src/config.js';
import { PrismaService, toJson, type CustomerRow, type UserRow } from '#src/service/prisma.js';
import {
  BridgeApiError,
  BridgeService,
  type BridgeCustomer,
  type BridgeKycLink,
  type BridgeRejectionReason,
  type BridgeWebhookEvent,
} from '#src/service/bridge/index.js';
import { MailerService } from '#src/service/mailer.js';
import { QueueService } from '#src/service/queue.js';
import { CustomerStatus, CustomerType, FiatCurrency, OnboardingStep } from '#src/graphql/enum.js';
import { AuditLogService } from '#src/entity/auditLog/auditLog.service.js';
import { CustomerService } from '#src/entity/customer/customer.service.js';
import { WalletService } from '#src/entity/wallet/wallet.service.js';
import { CustodialWalletService } from '#src/entity/custodialWallet/custodialWallet.service.js';
import { VirtualAccountService } from '#src/entity/virtualAccount/virtualAccount.service.js';
import type { WebhookOutcome } from '#src/webhook/dispatcher.js';
import { AppError } from '#src/utils/errors.js';
import type { Context } from '#src/context.js';

import type { OnboardingStatus } from './onboarding.type.js';

export const COMPLETE_ONBOARDING = 'complete-onboarding';

/** `base` covers USD (ACH/wire); `sepa` covers EUR. */
const ENDORSEMENTS = ['base', 'sepa'];

const KYC_IN_PROGRESS = new Set([
  'not_started',
  'incomplete',
  'awaiting_questionnaire',
  'awaiting_ubo',
]);
const KYC_REVIEW = new Set(['under_review', 'paused']);
const KYC_REJECTED = new Set(['rejected', 'offboarded']);

/** Bridge's customer object says `active` where KYC links say `approved`. */
const normalizeKycStatus = (status?: string | null) => {
  if (!status) return 'not_started';
  return status === 'active' ? 'approved' : status;
};

/** Only the customer-facing reason is kept; `developer_reason` stays with Bridge. */
const customerReasons = (reasons?: BridgeRejectionReason[] | null) =>
  (reasons ?? [])
    .map((r) => r.reason)
    .filter((r): r is string => typeof r === 'string' && r.length > 0);

const redirectUri = () => `${config.FRONTEND_URL}/onboarding`;

@Service()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bridge: BridgeService,
    private readonly customers: CustomerService,
    private readonly wallets: WalletService,
    private readonly custodial: CustodialWalletService,
    private readonly virtualAccounts: VirtualAccountService,
    private readonly mailer: MailerService,
    private readonly queue: QueueService,
    private readonly audit: AuditLogService
  ) {}

  // Status

  async status(customer: CustomerRow): Promise<OnboardingStatus> {
    const vas = await this.prisma.orm.VirtualAccount.where((v) =>
      and(v.customerId.eq(customer.id), v.deactivatedAt.isNull())
    )
      .select('sourceCurrency')
      .all();
    const reasons = Array.isArray(customer.rejectionReasons)
      ? (customer.rejectionReasons as string[])
      : [];
    return {
      step: this.step(customer),
      status: customer.status,
      type: customer.type,
      kycStatus: customer.kycStatus,
      tosStatus: customer.tosStatus,
      rejectionReasons: reasons.filter((r) => typeof r === 'string'),
      tosLink: customer.tosStatus === 'approved' ? null : customer.tosLink,
      kycLink: KYC_IN_PROGRESS.has(customer.kycStatus) ? customer.kycLink : null,
      currencies: [...new Set(vas.map((v) => v.sourceCurrency as FiatCurrency))],
      sandbox: isBridgeSandbox,
    };
  }

  step(customer: CustomerRow): OnboardingStep {
    if (customer.status === CustomerStatus.Active) return OnboardingStep.Done;
    if (!customer.type || (!customer.kycLinkId && !customer.bridgeCustomerId))
      return OnboardingStep.ChooseType;
    if (KYC_REJECTED.has(customer.kycStatus)) return OnboardingStep.Rejected;
    if (customer.kycStatus === 'approved') return OnboardingStep.Finalize;
    if (customer.tosStatus !== 'approved') return OnboardingStep.AcceptTos;
    if (KYC_REVIEW.has(customer.kycStatus)) return OnboardingStep.UnderReview;
    return OnboardingStep.CompleteKyc;
  }

  // Customer actions

  async start(user: UserRow, customer: CustomerRow, type: CustomerType, ctx: Context) {
    if (customer.status === CustomerStatus.Active)
      throw new AppError('Onboarding is already complete');
    if (customer.status === CustomerStatus.Suspended)
      throw new AppError('Your account is suspended');
    if (!user.isEmailVerified)
      throw new AppError('Verify your email address first', { code: 'EMAIL_NOT_VERIFIED' });
    this.assertBridge();

    const started = !!(customer.kycLinkId || customer.bridgeCustomerId);
    if (started && customer.type === type) return this.refresh(customer);
    if (started && customer.kycStatus !== 'not_started') {
      throw new AppError(
        'Verification is already in progress and the account type can no longer change'
      );
    }

    const updated = await this.startHosted(user, customer, type);

    await this.audit.log(ctx, {
      action: 'onboarding.start',
      entity: 'Customer',
      entityId: customer.id,
      after: { type, sandbox: isBridgeSandbox },
    });
    return updated;
  }

  /** Bridge-hosted ToS + KYC/KYB. Only name, email, type and endorsements are sent. */
  private async startHosted(user: UserRow, customer: CustomerRow, type: CustomerType) {
    let link: BridgeKycLink;
    try {
      link = await this.bridge.kycLinks.create({
        fullName: user.name,
        email: user.email,
        type,
        endorsements: ENDORSEMENTS,
        redirectUri: redirectUri(),
        idempotencyKey: `kyc-link-${customer.id}-${type}-${createHash('sha256')
          .update(`${user.name}\n${user.email}`)
          .digest('hex')
          .slice(0, 16)}`,
      });
    } catch (error) {
      const existing = this.existingKycLink(error);
      if (!existing) throw this.userFacing(error);
      link = existing;
    }
    await this.customers.update(customer.id, { type });
    return this.applyKycLink({ ...customer, type }, link);
  }

  /** Bridge answers a duplicate email with the existing link in the error body. */
  private existingKycLink(error: unknown): BridgeKycLink | null {
    if (!(error instanceof BridgeApiError) || error.status !== 400) return null;
    const body = error.body as { existing_kyc_link?: BridgeKycLink } | undefined;
    return body?.existing_kyc_link?.id ? body.existing_kyc_link : null;
  }

  /**
   * Sandbox only: approves the identity without filling in Bridge's hosted form.
   * The terms must be accepted first so account creation behaves like production.
   */
  async simulateApproval(customer: CustomerRow) {
    if (!isBridgeSandbox) throw new AppError('Test approval is only available in sandbox');
    this.assertBridge();
    if (customer.status !== CustomerStatus.Onboarding)
      throw new AppError('Identity verification is already complete');
    if (customer.tosStatus !== 'approved') throw new AppError('Accept the terms of service first');
    if (!customer.bridgeCustomerId) throw new AppError('Start verification first');
    try {
      await this.bridge.customers.simulateKycApproval(customer.bridgeCustomerId);
    } catch (error) {
      throw this.userFacing(error);
    }
    return this.refresh(customer);
  }

  /** Re-reads status from Bridge (button on the onboarding page; also the poller). */
  async refresh(customer: CustomerRow) {
    this.assertBridge();
    try {
      if (customer.kycLinkId) {
        const link = await this.bridge.kycLinks.get(customer.kycLinkId);
        customer = await this.applyKycLink(customer, link);
      }
      if (customer.bridgeCustomerId) {
        const remote = await this.bridge.customers.get(customer.bridgeCustomerId);
        customer = await this.applyBridgeCustomer(customer, remote);
      }
    } catch (error) {
      throw this.userFacing(error);
    }
    return customer;
  }

  /** Fresh hosted link when the old one expired or Bridge requests more information. */
  async regenerateKycLink(customer: CustomerRow) {
    this.assertBridge();
    try {
      if (customer.bridgeCustomerId) {
        const { url } = await this.bridge.customers.kycLink(customer.bridgeCustomerId, {
          redirectUri: redirectUri(),
        });
        return this.customers.update(customer.id, { kycLink: url });
      }
      if (customer.kycLinkId) {
        return this.applyKycLink(customer, await this.bridge.kycLinks.get(customer.kycLinkId));
      }
    } catch (error) {
      throw this.userFacing(error);
    }
    throw new AppError('Start onboarding first');
  }

  /**
   * After approval: generated wallets (payout defaults to Base), custodial wallet,
   * virtual accounts. Every step is idempotent, so the mutation and the job can race.
   */
  async complete(customerId: number): Promise<CustomerRow> {
    let customer = await this.customers.getById(customerId);
    if (!customer) throw new AppError('Customer not found');
    if (customer.status === CustomerStatus.Suspended)
      throw new AppError('Your account is suspended');
    if (customer.kycStatus !== 'approved' || !customer.bridgeCustomerId) {
      throw new AppError('Identity verification is not approved yet');
    }
    this.assertBridge();

    await this.wallets.ensureGeneratedWallets(customer);
    customer = (await this.customers.getById(customerId))!;

    let results;
    try {
      const custodial = await this.custodial.ensure(customer);
      results = await this.virtualAccounts.ensureForCustomer(customer, custodial);
    } catch (error) {
      throw this.userFacing(error);
    }
    const ready = results.filter((r) => r.virtualAccount);
    if (ready.length === 0) {
      throw new AppError('We could not open your deposit accounts yet. Please try again shortly.');
    }

    if (customer.status !== CustomerStatus.Active) {
      const activated = await this.prisma.orm.Customer.where((c) =>
        and(c.id.eq(customerId), c.status.eq(CustomerStatus.Onboarding))
      ).update({ status: CustomerStatus.Active, onboardedAt: new Date() });
      if (activated) {
        customer = activated;
        await this.audit.log(null, {
          action: 'onboarding.complete',
          entity: 'Customer',
          entityId: customerId,
          after: { currencies: ready.map((r) => r.currency) },
        });
        const user = await this.prisma.orm.User.where({ id: customer.userId }).first();
        if (user) {
          this.mailer.sendSafe({
            to: user.email,
            subject: 'Your NxPay deposit accounts are ready',
            template: 'kyc-approved',
            locals: { name: user.name },
          });
        }
      } else {
        customer = (await this.customers.getById(customerId))!;
      }
    }
    return customer;
  }

  // Bridge state -> customer row

  async applyKycLink(customer: CustomerRow, link: BridgeKycLink) {
    const next = {
      kycLinkId: link.id,
      kycLink: link.kyc_link,
      tosLink: link.tos_link,
      tosStatus: link.tos_status ?? customer.tosStatus,
      kycStatus: normalizeKycStatus(link.kyc_status),
      rejectionReasons: toJson(customerReasons(link.rejection_reasons)),
      ...(link.customer_id && !customer.bridgeCustomerId && { bridgeCustomerId: link.customer_id }),
    };
    return this.transition(customer, next);
  }

  async applyBridgeCustomer(customer: CustomerRow, remote: BridgeCustomer) {
    const next = {
      bridgeCustomerId: remote.id,
      kycStatus: normalizeKycStatus(remote.status ?? remote.kyc_status),
      ...(remote.has_accepted_terms_of_service !== undefined && {
        tosStatus: remote.has_accepted_terms_of_service ? 'approved' : customer.tosStatus,
      }),
      endorsements: toJson(
        (remote.endorsements ?? []).map((e) => ({ name: e.name, status: e.status }))
      ),
      rejectionReasons: toJson(customerReasons(remote.rejection_reasons)),
    };
    const updated = await this.transition(customer, next);
    // New endorsements (e.g. `sepa`) can unlock a currency that failed during onboarding
    if (updated.status === CustomerStatus.Active) {
      await this.queue.sendSafe(
        COMPLETE_ONBOARDING,
        { customerId: updated.id },
        { singletonKey: `onboard-${updated.id}` }
      );
    }
    return updated;
  }

  private async transition(customer: CustomerRow, next: Partial<CustomerRow>) {
    const before = customer.kycStatus;
    const updated = await this.customers.update(customer.id, next);
    const after = updated.kycStatus;
    if (before === after) return updated;

    await this.audit.log(null, {
      action: 'onboarding.kycStatus',
      entity: 'Customer',
      entityId: customer.id,
      before: { kycStatus: before },
      after: { kycStatus: after },
    });

    if (after === 'approved' && updated.status === CustomerStatus.Onboarding) {
      await this.queue.sendSafe(
        COMPLETE_ONBOARDING,
        { customerId: updated.id },
        { singletonKey: `onboard-${updated.id}` }
      );
    }
    if (KYC_REJECTED.has(after) && !KYC_REJECTED.has(before)) {
      const user = await this.prisma.orm.User.where({ id: updated.userId }).first();
      if (user) {
        this.mailer.sendSafe({
          to: user.email,
          subject: 'We could not verify your identity',
          template: 'kyc-rejected',
          locals: { name: user.name, reasons: updated.rejectionReasons ?? [] },
        });
      }
    }
    return updated;
  }

  // Webhooks + poller

  async handleKycLinkEvent(event: BridgeWebhookEvent<BridgeKycLink>): Promise<WebhookOutcome> {
    const link = event.event_object;
    const customer = link?.id ? await this.customers.getByKycLinkId(link.id) : null;
    if (!customer) return 'ignored';
    await this.applyKycLink(customer, link);
    return 'processed';
  }

  async handleCustomerEvent(event: BridgeWebhookEvent<BridgeCustomer>): Promise<WebhookOutcome> {
    const remote = event.event_object;
    const customer = remote?.id ? await this.customers.getByBridgeCustomerId(remote.id) : null;
    if (!customer) return 'ignored';
    await this.applyBridgeCustomer(customer, remote);
    return 'processed';
  }

  /** Fallback for missed webhooks: customers mid-verification, and approved ones not yet finalized. */
  async syncPending() {
    if (!this.bridge.configured) return { refreshed: 0, finalized: 0 };
    const staleBefore = new Date(Date.now() - 60 * 1000);
    const pending = await this.prisma.orm.Customer.where((c) =>
      and(
        c.status.eq(CustomerStatus.Onboarding),
        or(c.kycLinkId.isNotNull(), c.bridgeCustomerId.isNotNull()),
        not(c.kycStatus.in([...KYC_REJECTED])),
        c.updatedAt.lt(staleBefore)
      )
    )
      .orderBy((c) => c.updatedAt.asc())
      .limit(100)
      .all();

    let refreshed = 0;
    let finalized = 0;
    for (const customer of pending) {
      try {
        if (customer.kycStatus === 'approved') {
          await this.queue.sendSafe(
            COMPLETE_ONBOARDING,
            { customerId: customer.id },
            { singletonKey: `onboard-${customer.id}` }
          );
          finalized++;
        } else {
          await this.refresh(customer);
          refreshed++;
        }
      } catch (error) {
        console.warn(`[onboarding] sync customer ${customer.id}: ${(error as Error).message}`);
      }
    }
    return { refreshed, finalized };
  }

  // Helpers

  private assertBridge() {
    if (!this.bridge.configured) {
      throw new AppError('Verification is temporarily unavailable. Please try again later.', {
        code: 'BRIDGE_UNAVAILABLE',
      });
    }
  }

  private userFacing(error: unknown) {
    if (error instanceof AppError) return error;
    if (error instanceof BridgeApiError) {
      // `source` names the rejected field on 400 invalid_parameters
      const source = (error.body as { source?: unknown } | undefined)?.source;
      console.error(
        `[onboarding] Bridge ${error.status} ${error.code ?? ''} ${error.path}: ${error.message}` +
          (source ? ` source=${JSON.stringify(source)}` : '')
      );
      return new AppError(
        error.retryable
          ? 'Our verification partner is temporarily unavailable. Please try again shortly.'
          : 'We could not start verification. Please contact support.',
        { code: 'BRIDGE_ERROR' }
      );
    }
    return error;
  }
}
