import { Service } from 'typedi';
import { and } from '@prisma/orm-postgres/orm-client';

import { config } from '#src/config.js';
import { PrismaService, lockKey, toJson, type TransactionRow } from '#src/service/prisma.js';
import {
  BridgeApiError,
  BridgeService,
  type BridgeTransfer,
  type BridgeWebhookEvent,
} from '#src/service/bridge/index.js';
import { MailerService } from '#src/service/mailer.js';
import { QueueService } from '#src/service/queue.js';
import {
  CustomerStatus,
  FiatCurrency,
  TransactionEventSource,
  TransactionState,
} from '#src/graphql/enum.js';
import { AuditLogService } from '#src/entity/auditLog/auditLog.service.js';
import { FeeScheduleService } from '#src/entity/fee/feeSchedule.service.js';
import { FxRateService } from '#src/entity/fee/fxRate.service.js';
import { calculateTieredFee, capFeeForMinimum } from '#src/entity/fee/fee.engine.js';
import { MonthlyVolumeService } from '#src/entity/monthlyVolume/monthlyVolume.service.js';
import { CustodialWalletService } from '#src/entity/custodialWallet/custodialWallet.service.js';
import { STABLECOIN_FOR } from '#src/entity/virtualAccount/virtualAccount.service.js';
import { stateForTransfer, TERMINAL_STATES } from '#src/state/transaction.stateMachine.js';
import type { WebhookOutcome } from '#src/webhook/dispatcher.js';
import type { Context } from '#src/context.js';
import { AppError, NotFoundError } from '#src/utils/errors.js';
import { isUuid } from '#src/utils/id.js';
import { explorerTxUrl } from '#src/utils/explorer.js';
import {
  centsToDecimal,
  decimalToCents,
  divideByDecimal,
  formatMoney,
  formatToken,
  multiplyByDecimal,
} from '#src/utils/money.js';
import { periodKeyOf } from '#src/utils/period.js';
import { shortAddress } from '#src/utils/walletAddress.js';

import { TransactionService } from './transaction.service.js';

export const CREATE_PAYOUT = 'create-payout';
export const SYNC_TRANSFER = 'sync-transfer';

/** Automatic retry delays after a failed payout attempt; manual retry is always possible. */
const RETRY_DELAYS_MINUTES = [5, 15, 60, 240, 720];
export const MAX_AUTO_ATTEMPTS = RETRY_DELAYS_MINUTES.length;

const BELOW_MINIMUM = 'Deposit is below the minimum payout amount';
const CHAIN_NAME: Record<string, string> = { base: 'Base', solana: 'Solana' };

export interface WalletSnapshot {
  walletId: string;
  chain: 'base' | 'solana';
  address: string;
  type: string;
  label: string | null;
}

/** Thrown to make pg-boss retry the job later (balance not there yet, Bridge outage). */
export class RetryLaterError extends Error {}

type Outcome = { retry?: string; completed?: boolean; finalFailure?: boolean };

@Service()
export class PayoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bridge: BridgeService,
    private readonly transactions: TransactionService,
    private readonly feeSchedules: FeeScheduleService,
    private readonly volumes: MonthlyVolumeService,
    private readonly fx: FxRateService,
    private readonly custodial: CustodialWalletService,
    private readonly mailer: MailerService,
    private readonly queue: QueueService,
    private readonly audit: AuditLogService
  ) {}

  // Fee

  /**
   * Counts the deposit in the customer's monthly volume and fixes its fee. Runs once
   * per transaction, serialized per customer so tier boundaries are applied in order.
   */
  async processDeposit(transactionId: string) {
    const tx = await this.transactions.getById(transactionId);
    if (!tx || tx.state !== TransactionState.Credited) return;
    if (tx.feeInCents === null) {
      const priced = await this.calculateFee(tx);
      if (!priced || priced.state !== TransactionState.Credited) return;
    }
    await this.queue.send(
      CREATE_PAYOUT,
      { transactionId },
      { singletonKey: `payout-${transactionId}` }
    );
  }

  private async usdEquivalent(tx: TransactionRow) {
    if (tx.usdEquivalentInCents !== null)
      return { usdInCents: tx.usdEquivalentInCents, fxRate: tx.fxRate };
    return this.fx.toUsd(tx.grossAmountInCents, tx.currency);
  }

  private async calculateFee(tx: TransactionRow): Promise<TransactionRow | null> {
    const periodKey = tx.periodKey ?? periodKeyOf(tx.fundsReceivedAt ?? tx.createdAt);
    const { usdInCents, fxRate } = await this.usdEquivalent(tx);
    const { schedule, tiers } = await this.feeSchedules.getForPeriod(periodKey);

    return this.prisma.transaction(async () => {
      await this.prisma.advisoryXactLock(lockKey(`fee:${tx.customerId}`));
      const fresh = await this.transactions.getById(tx.id);
      if (!fresh || fresh.feeInCents !== null) return fresh;

      const prevVolumeInCents = await this.volumes.volumeOf(fresh.customerId, periodKey);
      const result = calculateTieredFee(prevVolumeInCents, usdInCents, tiers);
      const feeInCurrency = fxRate ? divideByDecimal(result.feeInCents, fxRate) : result.feeInCents;
      const base = fresh.creditedAmountInCents ?? fresh.grossAmountInCents;
      const capped = capFeeForMinimum(feeInCurrency, base, this.feeSchedules.minimumPayoutInCents);
      const feeUsdInCents = !capped.capped
        ? result.feeInCents
        : fxRate
          ? multiplyByDecimal(capped.feeInCents, fxRate)
          : capped.feeInCents;

      const breakdown = {
        scheduleId: schedule.id,
        periodKey,
        prevVolumeInCents: prevVolumeInCents.toString(),
        usdEquivalentInCents: usdInCents.toString(),
        fxRate,
        feeUsdInCents: feeUsdInCents.toString(),
        uncappedFeeInCents: feeInCurrency.toString(),
        capped: capped.capped,
        lines: result.breakdown.map((line) => ({
          position: line.position,
          fromInCents: line.fromInCents.toString(),
          toInCents: line.toInCents?.toString() ?? null,
          rateBps: line.rateBps,
          amountInCents: line.amountInCents.toString(),
          feeInCents: line.feeInCents.toString(),
        })),
      };

      const updated = await this.transactions.update(fresh, {
        periodKey,
        usdEquivalentInCents: usdInCents,
        fxRate,
        feeInCents: capped.feeInCents,
        netAmountInCents: base - capped.feeInCents,
        feeScheduleId: schedule.id,
        feeBreakdown: toJson(breakdown),
        ...(!capped.payable && {
          state: TransactionState.PayoutFailed,
          failureReason: BELOW_MINIMUM,
        }),
      });
      if (!updated) throw new Error(`Transaction ${tx.id} changed during fee calculation`);

      await this.volumes.apply(fresh.customerId, periodKey, usdInCents, feeUsdInCents, 1);
      await this.transactions.recordEvent(
        tx.id,
        TransactionEventSource.system,
        'fee_calculated',
        breakdown
      );
      if (!capped.payable) {
        this.mailer.opsAlert('Deposit below minimum payout', [
          `Transaction ${tx.reference}: credited ${formatMoney(base, tx.currency)} is below the ${formatMoney(this.feeSchedules.minimumPayoutInCents, tx.currency)} minimum.`,
          'Funds remain in the custodial wallet; resolve manually.',
        ]);
      }
      return updated;
    });
  }

  // Payout

  private async snapshotWallet(customerId: string): Promise<WalletSnapshot | null> {
    const customer = await this.prisma.orm.Customer.where({ id: customerId }).first();
    if (!customer?.payoutWalletId) return null;
    const wallet = await this.prisma.orm.Wallet.where({ id: customer.payoutWalletId }).first();
    if (!wallet) return null;
    return {
      walletId: wallet.id,
      chain: wallet.chain as WalletSnapshot['chain'],
      address: wallet.address,
      type: wallet.type,
      label: wallet.label,
    };
  }

  private retryAt(attempts: number) {
    const minutes = RETRY_DELAYS_MINUTES[attempts - 1];
    return minutes === undefined ? null : new Date(Date.now() + minutes * 60_000);
  }

  /**
   * Sends credited stablecoin (minus `developer_fee`) to the payout wallet captured on
   * the first attempt. Only creates a new transfer when there is none in flight.
   */
  async createPayout(transactionId: string) {
    if (!this.bridge.configured) throw new RetryLaterError('Bridge API key not configured');
    const outcome = await this.prisma.transaction(async (): Promise<Outcome> => {
      await this.prisma.advisoryXactLock(lockKey(`payout:${transactionId}`));
      let tx = await this.transactions.getById(transactionId);
      if (!tx) return {};
      const retryable =
        tx.state === TransactionState.Credited || tx.state === TransactionState.PayoutFailed;
      if (!retryable) return {};
      if (tx.failureReason === BELOW_MINIMUM) return {};
      if (
        tx.feeInCents === null ||
        tx.netAmountInCents === null ||
        tx.creditedAmountInCents === null
      ) {
        return { retry: 'Fee not calculated yet' };
      }

      const customer = await this.prisma.orm.Customer.where({ id: tx.customerId }).first();
      if (!customer?.bridgeCustomerId) return { retry: 'Customer has no Bridge id' };
      if (customer.status === CustomerStatus.Suspended) {
        await this.fail(tx, 'Account suspended; payout held', { retry: false });
        return {};
      }

      const snapshot =
        (tx.destinationWalletSnapshot as WalletSnapshot | null) ??
        (await this.snapshotWallet(tx.customerId));
      if (!snapshot) {
        await this.fail(tx, 'No payout wallet set', { retry: false });
        return { finalFailure: true };
      }

      const va = tx.virtualAccountId
        ? await this.prisma.orm.VirtualAccount.where({ id: tx.virtualAccountId }).first()
        : null;
      const source = va
        ? await this.custodial.getById(va.custodialWalletId)
        : await this.custodial.getForCustomer(tx.customerId);
      if (!source) return { retry: 'Custodial wallet not found' };

      const stablecoin = STABLECOIN_FOR[tx.currency as FiatCurrency];
      const balance = decimalToCents(await this.custodial.balance(customer, source, stablecoin), {
        round: 'floor',
      });
      if (balance < tx.creditedAmountInCents) {
        return {
          retry: `Custodial balance ${centsToDecimal(balance)} below ${centsToDecimal(tx.creditedAmountInCents)}`,
        };
      }

      const attempts = tx.attempts + 1;
      const idempotencyKey = attempts === 1 ? `payout-${tx.id}` : `payout-${tx.id}-r${attempts}`;
      const request = {
        amount: centsToDecimal(tx.creditedAmountInCents),
        developer_fee: centsToDecimal(tx.feeInCents),
        on_behalf_of: customer.bridgeCustomerId,
        client_reference_id: `nxpay-tx-${tx.id}`,
        source: {
          payment_rail: 'bridge_wallet' as const,
          currency: stablecoin,
          bridge_wallet_id: source.bridgeWalletId,
        },
        destination: {
          payment_rail: snapshot.chain,
          currency: stablecoin,
          to_address: snapshot.address,
        },
      };

      let transfer: BridgeTransfer;
      try {
        transfer = await this.bridge.transfers.create(request, idempotencyKey);
      } catch (error) {
        if (error instanceof BridgeApiError && !error.retryable) {
          tx = await this.fail(tx, `Bridge rejected the payout: ${error.message}`, {
            retry: true,
            attempts,
            details: { request, response: error.body },
          });
          return { finalFailure: tx.nextRetryAt === null };
        }
        throw error;
      }

      const state = stateForTransfer(transfer.state) ?? TransactionState.PayoutPending;
      const settled =
        state === TransactionState.PayoutFailed || state === TransactionState.Completed;
      const updated = await this.transactions.update(tx, {
        bridgeTransferId: transfer.id,
        destinationWalletSnapshot: toJson(snapshot),
        attempts,
        state: settled ? TransactionState.PayoutPending : state,
        failureReason: null,
        nextRetryAt: null,
      });
      if (!updated) throw new Error(`Transaction ${tx.id} changed while creating payout`);
      await this.transactions.recordEvent(tx.id, TransactionEventSource.system, 'payout_created', {
        transferId: transfer.id,
        state: transfer.state,
        idempotencyKey,
        attempt: attempts,
        request,
      });
      if (!settled) return {};
      const applied = await this.applyTransferLocked(
        updated,
        transfer,
        TransactionEventSource.system
      );
      return {
        completed: applied.state === TransactionState.Completed,
        finalFailure: applied.finalFailure,
      };
    });

    if (outcome.retry) throw new RetryLaterError(outcome.retry);
    if (outcome.completed) await this.notifyCompleted(transactionId);
    if (outcome.finalFailure) await this.notifyFailed(transactionId);
  }

  private async fail(
    tx: TransactionRow,
    reason: string,
    {
      retry,
      attempts = tx.attempts,
      details,
    }: { retry: boolean; attempts?: number; details?: Record<string, unknown> }
  ): Promise<TransactionRow> {
    const nextRetryAt = retry ? this.retryAt(attempts) : null;
    const updated = await this.transactions.update(tx, {
      state: TransactionState.PayoutFailed,
      failureReason: reason,
      attempts,
      nextRetryAt,
    });
    if (!updated) throw new Error(`Transaction ${tx.id} changed while recording failure`);
    await this.transactions.recordEvent(tx.id, TransactionEventSource.system, 'payout_failed', {
      reason,
      attempt: attempts,
      nextRetryAt,
      ...details,
    });
    return updated;
  }

  // Transfer status

  handleWebhook(event: BridgeWebhookEvent<BridgeTransfer>): Promise<WebhookOutcome> {
    return this.applyTransfer(event.event_object, TransactionEventSource.bridge_transfer);
  }

  private async findForTransfer(transfer: BridgeTransfer) {
    const byId = await this.transactions.getByTransferId(transfer.id);
    if (byId) return byId;
    // Transfers created before the rename carry the `gogo` prefix.
    const ref = /^(?:nxpay|gogo)-tx-(.+)$/.exec(transfer.client_reference_id ?? '')?.[1];
    return ref && isUuid(ref) ? this.transactions.getById(ref) : null;
  }

  async applyTransfer(
    transfer: BridgeTransfer,
    source: TransactionEventSource
  ): Promise<WebhookOutcome> {
    const found = await this.findForTransfer(transfer);
    if (!found) return 'ignored';
    let changed: TransactionState | null = null;
    let finalFailure = false;
    await this.prisma.transaction(async () => {
      await this.prisma.advisoryXactLock(lockKey(`payout:${found.id}`));
      const tx = await this.transactions.getById(found.id);
      if (!tx) return;
      const result = await this.applyTransferLocked(tx, transfer, source);
      changed = result.state;
      finalFailure = result.finalFailure;
    });
    if (changed === TransactionState.Completed) await this.notifyCompleted(found.id);
    if (finalFailure) await this.notifyFailed(found.id);
    return changed ? 'processed' : 'ignored';
  }

  private async applyTransferLocked(
    tx: TransactionRow,
    transfer: BridgeTransfer,
    source: TransactionEventSource
  ) {
    const none = { state: null, finalFailure: false };
    // Updates for an earlier, already failed attempt
    if (tx.bridgeTransferId && tx.bridgeTransferId !== transfer.id) return none;
    if (TERMINAL_STATES.has(tx.state as TransactionState)) return none;
    const target = stateForTransfer(transfer.state);
    if (!target) return none;
    if (target === tx.state && target !== TransactionState.PayoutFailed) return none;
    if (target === TransactionState.PayoutFailed && tx.state === TransactionState.PayoutFailed)
      return none;

    await this.transactions.recordEvent(tx.id, source, `transfer.${transfer.state}`, transfer);

    if (target === TransactionState.PayoutFailed) {
      const reason = `Transfer ${transfer.state.replace(/_/g, ' ')}${transfer.return_details?.reason ? `: ${transfer.return_details.reason}` : ''}`;
      const updated = await this.fail(tx, reason, { retry: true });
      return { state: target, finalFailure: updated.nextRetryAt === null };
    }

    const updated = await this.transactions.update(tx, {
      state: target,
      bridgeTransferId: transfer.id,
      ...(target === TransactionState.Completed && {
        txHash: transfer.receipt?.destination_tx_hash ?? tx.txHash,
        completedAt: transfer.updated_at ? new Date(transfer.updated_at) : new Date(),
        failureReason: null,
        nextRetryAt: null,
      }),
    });
    if (!updated) throw new Error(`Transaction ${tx.id} changed while applying transfer`);
    return { state: target, finalFailure: false };
  }

  async syncTransfer(transactionId: string) {
    const tx = await this.transactions.getById(transactionId);
    if (!tx?.bridgeTransferId || TERMINAL_STATES.has(tx.state as TransactionState)) return;
    const transfer = await this.bridge.transfers.get(tx.bridgeTransferId);
    await this.applyTransfer(transfer, TransactionEventSource.system);
  }

  // Schedulers

  /** Payouts waiting on Bridge; webhooks are primary, this catches missed ones. */
  async inFlight(limit = 200) {
    return this.prisma.orm.Transaction.where((t) =>
      and(
        t.state.in([TransactionState.PayoutPending, TransactionState.PayoutSubmitted]),
        t.bridgeTransferId.isNotNull()
      )
    )
      .orderBy((t) => t.updatedAt.asc())
      .limit(limit)
      .all();
  }

  /** Enqueues due automatic retries and recovers transactions whose job was lost. */
  async retryDue() {
    if (!this.bridge.configured) return { retried: 0, recovered: 0 };
    const now = new Date();
    const due = await this.prisma.orm.Transaction.where((t) =>
      and(
        t.state.eq(TransactionState.PayoutFailed),
        t.nextRetryAt.isNotNull(),
        t.nextRetryAt.lte(now)
      )
    )
      .limit(100)
      .all();
    for (const tx of due) {
      await this.queue.sendSafe(
        CREATE_PAYOUT,
        { transactionId: tx.id },
        { singletonKey: `payout-${tx.id}` }
      );
    }

    const stale = await this.transactions.stuck(
      [TransactionState.Credited],
      new Date(Date.now() - 10 * 60_000)
    );
    for (const tx of stale) {
      await this.queue.sendSafe(
        'process-deposit',
        { transactionId: tx.id },
        { singletonKey: `deposit-${tx.id}`, group: { id: `customer-${tx.customerId}` } }
      );
    }
    return { retried: due.length, recovered: stale.length };
  }

  /** Daily check for money that stopped moving. */
  async reconcile() {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60_000);
    const stuck = await this.transactions.stuck(
      [
        TransactionState.Received,
        TransactionState.Converting,
        TransactionState.InReview,
        TransactionState.Credited,
        TransactionState.PayoutPending,
        TransactionState.PayoutSubmitted,
      ],
      dayAgo,
      500
    );
    const failed = await this.prisma.orm.Transaction.where((t) =>
      and(t.state.eq(TransactionState.PayoutFailed), t.nextRetryAt.isNull())
    )
      .limit(500)
      .all();
    if (stuck.length || failed.length) {
      this.mailer.opsAlert('Daily reconciliation', [
        `${stuck.length} transaction(s) unchanged for over 24h: ${stuck.map((t) => `${t.reference} ${t.state}`).join(', ') || 'none'}`,
        `${failed.length} failed payout(s) need manual action: ${failed.map((t) => t.reference).join(', ') || 'none'}`,
      ]);
    }
    return { stuck: stuck.length, failed: failed.length };
  }

  // Admin

  async adminRetry(transactionId: string, ctx: Context) {
    const tx = await this.transactions.getById(transactionId);
    if (!tx) throw new NotFoundError('Transaction not found');
    if (tx.state !== TransactionState.PayoutFailed)
      throw new AppError('Only failed payouts can be retried');
    if (tx.failureReason === BELOW_MINIMUM)
      throw new AppError('This deposit is below the minimum payout and cannot be sent');
    const updated = await this.transactions.update(tx, { nextRetryAt: new Date() });
    if (!updated) throw new AppError('Transaction changed; reload and try again');
    await this.transactions.recordEvent(
      tx.id,
      TransactionEventSource.admin,
      'payout_retry_requested',
      {
        by: ctx.user?.id,
      }
    );
    await this.audit.log(ctx, {
      action: 'transaction.retryPayout',
      entity: 'Transaction',
      entityId: tx.id,
      before: { state: tx.state, failureReason: tx.failureReason, attempts: tx.attempts },
    });
    await this.queue.send(
      CREATE_PAYOUT,
      { transactionId: tx.id },
      { singletonKey: `payout-${tx.id}` }
    );
    return updated;
  }

  // Notifications

  private async recipient(customerId: string) {
    const customer = await this.prisma.orm.Customer.where({ id: customerId }).first();
    return customer ? this.prisma.orm.User.where({ id: customer.userId }).first() : null;
  }

  private async notifyCompleted(transactionId: string) {
    const tx = await this.transactions.getById(transactionId);
    const user = tx && (await this.recipient(tx.customerId));
    if (!tx || !user) return;
    const wallet = tx.destinationWalletSnapshot as WalletSnapshot | null;
    const stablecoin = STABLECOIN_FOR[tx.currency as FiatCurrency].toUpperCase();
    const net = tx.netAmountInCents ?? 0n;
    this.mailer.sendSafe({
      to: user.email,
      subject: `Sent ${formatToken(net, stablecoin)} to your wallet`,
      template: 'payout-completed',
      locals: {
        name: user.name,
        reference: tx.reference,
        explorerUrl: explorerTxUrl(wallet?.chain, tx.txHash),
        rows: [
          ['Deposit', formatMoney(tx.grossAmountInCents, tx.currency)],
          ['NxPay fee', formatMoney(tx.feeInCents ?? 0n, tx.currency)],
          ['You received', formatToken(net, stablecoin)],
          ['Network', CHAIN_NAME[wallet?.chain ?? ''] ?? wallet?.chain ?? ''],
          ['Wallet', wallet ? shortAddress(wallet.address) : ''],
        ],
      },
    });
  }

  private async notifyFailed(transactionId: string) {
    const tx = await this.transactions.getById(transactionId);
    if (!tx) return;
    this.mailer.opsAlert('Payout needs attention', [
      `Transaction ${tx.reference} (${tx.id}) for customer ${tx.customerId} failed after ${tx.attempts} attempt(s).`,
      tx.failureReason ?? '',
    ]);
    const user = await this.recipient(tx.customerId);
    if (!user) return;
    this.mailer.sendSafe({
      to: user.email,
      subject: 'Your payout is delayed',
      template: 'payout-failed',
      locals: {
        name: user.name,
        reference: tx.reference,
        rows: [
          ['Deposit', formatMoney(tx.grossAmountInCents, tx.currency)],
          ['Status', 'Payout delayed, our team is on it'],
          ['Reference', tx.reference],
        ],
      },
    });
  }

  /** Per-attempt cap shared with the admin UI. */
  get maxAutoAttempts() {
    return MAX_AUTO_ATTEMPTS;
  }

  get minimumPayoutInCents() {
    return config.BRIDGE_MIN_TRANSFER_IN_CENTS;
  }
}
