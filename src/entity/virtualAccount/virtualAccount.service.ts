import { Service } from 'typedi';
import { and } from '@prisma/orm-postgres/orm-client';

import {
  PrismaService,
  toJson,
  type CustodialWalletRow,
  type CustomerRow,
  type VirtualAccountRow,
} from '#src/service/prisma.js';
import { BridgeService, type BridgeVirtualAccount } from '#src/service/bridge/index.js';
import { FiatCurrency } from '#src/graphql/enum.js';
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

  async activeFor(customerId: string, currency: FiatCurrency) {
    return this.prisma.orm.VirtualAccount.where((v) =>
      and(v.customerId.eq(customerId), v.sourceCurrency.eq(currency), v.deactivatedAt.isNull())
    ).first();
  }

  /**
   * USD -> USDC and EUR -> EURC accounts into the custodial wallet, 0% Bridge fee.
   * Each currency is independent: EUR needs the `sepa` endorsement, so a failure there
   * doesn't block USD and is retried on the next onboarding sync.
   */
  async ensureForCustomer(
    customer: CustomerRow,
    custodial: CustodialWalletRow
  ): Promise<EnsureResult[]> {
    const results: EnsureResult[] = [];
    for (const currency of [FiatCurrency.usd, FiatCurrency.eur]) {
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
    if (!customer.bridgeCustomerId)
      throw new Error(`Customer ${customer.id} has no Bridge customer`);

    const remote = await this.bridge.virtualAccounts.create({
      customerId: customer.bridgeCustomerId,
      sourceCurrency: currency,
      destinationCurrency: STABLECOIN_FOR[currency],
      chain: custodial.chain as 'base' | 'solana',
      bridgeWalletId: custodial.bridgeWalletId,
    });
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
      status: remote.status ?? 'activated',
    };
  }

  /** Re-reads status and deposit instructions from Bridge (`account_update` events). */
  async refresh(va: VirtualAccountRow, bridgeCustomerId: string) {
    const remote = await this.bridge.virtualAccounts.get(
      bridgeCustomerId,
      va.bridgeVirtualAccountId
    );
    return this.prisma.orm.VirtualAccount.where({ id: va.id }).update({
      status: remote.status,
      depositInstructions: toJson(remote.source_deposit_instructions ?? va.depositInstructions),
      deactivatedAt: remote.status === 'deactivated' ? (va.deactivatedAt ?? new Date()) : null,
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
      status: remote.status ?? 'deactivated',
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
