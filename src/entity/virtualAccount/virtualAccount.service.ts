import { Service } from 'typedi';
import { and } from '@prisma/orm-postgres/orm-client';

import {
  lockKey,
  PrismaService,
  toJson,
  type CustodialWalletRow,
  type CustomerRow,
  type VirtualAccountRow,
} from '#src/service/prisma.js';
import { BridgeService, type BridgeVirtualAccount } from '#src/service/bridge/index.js';
import {
  FiatCurrency,
  normalizeVirtualAccountStatus,
  VirtualAccountStatus,
} from '#src/graphql/enum.js';
import { AuditLogService } from '#src/entity/auditLog/auditLog.service.js';
import { AppError, NotFoundError, isSqlError } from '#src/utils/errors.js';
import type { Context } from '#src/context.js';

import type { VirtualAccountQueryArgs } from './virtualAccount.type.js';

export const STABLECOIN_FOR: Record<FiatCurrency, 'usdc' | 'eurc'> = {
  [FiatCurrency.usd]: 'usdc',
  [FiatCurrency.eur]: 'eurc',
};

const VA_LIST = {
  model: 'VirtualAccount',
  filterable: ['id', 'customerId', 'sourceCurrency', 'destinationChain', 'status', 'createdAt'],
  sortable: ['id', 'createdAt', 'sourceCurrency', 'status'],
  defaultSort: 'createdAt',
} as const;

export interface EnsureResult {
  currency: FiatCurrency;
  virtualAccount?: VirtualAccountRow;
  error?: string;
}

@Service()
export class VirtualAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bridge: BridgeService,
    private readonly audit: AuditLogService
  ) {}

  async list(query: VirtualAccountQueryArgs): Promise<VirtualAccountRow[]> {
    return query.applyTo(this.prisma.orm.VirtualAccount, VA_LIST).all();
  }

  async count(query: VirtualAccountQueryArgs): Promise<number> {
    const { total } = await query
      .applyFilter(this.prisma.orm.VirtualAccount, VA_LIST)
      .aggregate((a) => ({ total: a.count() }));
    return Number(total);
  }

  async getById(id: string) {
    return this.prisma.orm.VirtualAccount.where({ id }).first();
  }

  async getByBridgeId(bridgeVirtualAccountId: string) {
    return this.prisma.orm.VirtualAccount.where({ bridgeVirtualAccountId }).first();
  }

  /** Currencies that have had a deposit account, including ones staff deactivated. */
  async openedCurrencies(customerId: string): Promise<Set<FiatCurrency>> {
    const rows = await this.prisma.orm.VirtualAccount.where({ customerId })
      .select('sourceCurrency')
      .all();
    return new Set(rows.map((r) => r.sourceCurrency as FiatCurrency));
  }

  async activeFor(customerId: string, currency: FiatCurrency) {
    return this.prisma.orm.VirtualAccount.where((v) =>
      and(v.customerId.eq(customerId), v.sourceCurrency.eq(currency), v.deactivatedAt.isNull())
    ).first();
  }

  /**
   * USD -> USDC and EUR -> EURC accounts into the custodial wallet, 0% Bridge fee.
   * Each currency is independent: EUR needs the `sepa` endorsement, so a failure there
   * doesn't block USD and is retried once Bridge approves the endorsement.
   */
  async ensureForCustomer(
    customer: CustomerRow,
    custodial: CustodialWalletRow,
    currencies: FiatCurrency[] = [FiatCurrency.usd, FiatCurrency.eur]
  ): Promise<EnsureResult[]> {
    const results: EnsureResult[] = [];
    for (const currency of currencies) {
      try {
        results.push({
          currency,
          virtualAccount: await this.ensure(customer, custodial, currency),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[virtual-account] customer ${customer.id} ${currency}: ${message}`);
        results.push({ currency, error: message });
      }
    }
    return results;
  }

  async ensure(customer: CustomerRow, custodial: CustodialWalletRow, currency: FiatCurrency) {
    const existing = await this.activeFor(customer.id, currency);
    if (existing) return existing;
    const bridgeCustomerId = customer.bridgeCustomerId;
    if (!bridgeCustomerId) throw new Error(`Customer ${customer.id} has no Bridge customer`);

    // Bridge replays a reused idempotency key's first response (even a failure) for 24h, so each
    // attempt gets a fresh key. The lock and the lookup of unsaved Bridge accounts prevent duplicates.
    const remote = await this.prisma.transaction(async () => {
      await this.prisma.advisoryXactLock(lockKey(`va:${customer.id}:${currency}`));
      const saved = await this.activeFor(customer.id, currency);
      if (saved) return null;
      const { data } = await this.bridge.virtualAccounts.list(bridgeCustomerId);
      const unsaved = data.find(
        (va) =>
          va.source_deposit_instructions?.currency === currency &&
          va.status !== VirtualAccountStatus.deactivated
      );
      if (unsaved && !(await this.getByBridgeId(unsaved.id))) return unsaved;
      return this.bridge.virtualAccounts.create({
        customerId: bridgeCustomerId,
        sourceCurrency: currency,
        destinationCurrency: STABLECOIN_FOR[currency],
        chain: custodial.chain as 'base' | 'solana',
        bridgeWalletId: custodial.bridgeWalletId,
      });
    });
    if (!remote) return (await this.activeFor(customer.id, currency))!;
    try {
      return await this.prisma.orm.VirtualAccount.create(
        this.rowFromRemote(customer.id, custodial, currency, remote)
      );
    } catch (error) {
      if (!isSqlError(error, '23505')) throw error;
      const winner = await this.getByBridgeId(remote.id);
      if (!winner) throw error;
      return winner;
    }
  }

  private rowFromRemote(
    customerId: string,
    custodial: CustodialWalletRow,
    currency: FiatCurrency,
    remote: BridgeVirtualAccount
  ) {
    return {
      customerId,
      custodialWalletId: custodial.id,
      bridgeVirtualAccountId: remote.id,
      sourceCurrency: currency,
      destinationCurrency: STABLECOIN_FOR[currency],
      destinationChain: custodial.chain,
      depositInstructions: toJson(remote.source_deposit_instructions ?? {}),
      status: normalizeVirtualAccountStatus(remote.status),
    };
  }

  /** Re-reads status and deposit instructions from Bridge (`account_update` events). */
  async refresh(va: VirtualAccountRow, bridgeCustomerId: string) {
    const remote = await this.bridge.virtualAccounts.get(
      bridgeCustomerId,
      va.bridgeVirtualAccountId
    );
    return this.prisma.orm.VirtualAccount.where({ id: va.id }).update({
      status: normalizeVirtualAccountStatus(remote.status),
      depositInstructions: toJson(remote.source_deposit_instructions ?? va.depositInstructions),
      deactivatedAt:
        remote.status === VirtualAccountStatus.deactivated
          ? (va.deactivatedAt ?? new Date())
          : null,
    });
  }

  async deactivate(id: string, ctx: Context) {
    const va = await this.getById(id);
    if (!va) throw new NotFoundError('Virtual account');
    if (va.deactivatedAt) throw new AppError('Virtual account is already deactivated');
    const customer = await this.prisma.orm.Customer.where({ id: va.customerId }).first();
    if (!customer?.bridgeCustomerId) throw new AppError('Customer has no Bridge account');

    const remote = await this.bridge.virtualAccounts.deactivate(
      customer.bridgeCustomerId,
      va.bridgeVirtualAccountId
    );
    const updated = await this.prisma.orm.VirtualAccount.where({ id }).update({
      status: VirtualAccountStatus.deactivated,
      deactivatedAt: new Date(),
    });
    await this.audit.log(ctx, {
      action: 'virtualAccount.deactivate',
      entity: 'VirtualAccount',
      entityId: id,
      before: { status: va.status },
      after: { status: updated?.status },
    });
    return updated!;
  }
}
