import { Service } from 'typedi';
import { or } from '@prisma/orm-postgres/orm-client';

import { PrismaService, type CustomerRow } from '#src/service/prisma.js';
import { config } from '#src/config.js';
import { CustomerStatus } from '#src/graphql/enum.js';
import { AuditLogService } from '#src/entity/auditLog/auditLog.service.js';
import { AppError, NotFoundError } from '#src/utils/errors.js';
import type { Context } from '#src/context.js';

import type { CustomerQueryArgs } from './customer.type.js';

export type CustomerUpdate = Partial<
  Omit<CustomerRow, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
>;

const CUSTOMER_LIST = {
  model: 'Customer',
  filterable: [
    'id',
    'userId',
    'type',
    'status',
    'country',
    'region',
    'kycStatus',
    'tosStatus',
    'onboardedAt',
    'createdAt',
  ],
  sortable: ['id', 'createdAt', 'onboardedAt', 'status', 'kycStatus', 'country'],
  defaultSort: 'createdAt',
} as const;

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Bridge custodial wallets aren't available everywhere (e.g. NY, TX), so signup
 * enforces the configured geography rules.
 */
export function assertSupportedGeography(country: string, region?: string | null) {
  const c = country.toUpperCase();
  if (config.BLOCKED_COUNTRIES.map((x) => x.toUpperCase()).includes(c)) {
    throw new AppError('NxPay is not available in your country yet', { field: 'country' });
  }
  if (c === 'US') {
    if (!region) throw new AppError('Select your state', { field: 'region' });
    if (config.BLOCKED_US_STATES.map((x) => x.toUpperCase()).includes(region.toUpperCase())) {
      throw new AppError('NxPay is not available in your state yet', { field: 'region' });
    }
  }
}

@Service()
export class CustomerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService
  ) {}

  private async searchCollection(query: CustomerQueryArgs) {
    let collection = this.prisma.orm.Customer;
    const term = query.search?.trim();
    if (term) {
      const pattern = `%${escapeLike(term)}%`;
      const users = await this.prisma.orm.User.where((u) =>
        or(u.email.ilike(pattern), u.name.ilike(pattern))
      )
        .select('id')
        .limit(500)
        .all();
      const ids = users.map((u) => u.id);
      collection = collection.where((c) =>
        c.userId.in(ids.length ? ids : [-1])
      ) as typeof collection;
    }
    return collection;
  }

  async list(query: CustomerQueryArgs): Promise<CustomerRow[]> {
    return query.applyTo(await this.searchCollection(query), CUSTOMER_LIST).all();
  }

  async count(query: CustomerQueryArgs): Promise<number> {
    const { total } = await query
      .applyFilter(await this.searchCollection(query), CUSTOMER_LIST)
      .aggregate((a) => ({ total: a.count() }));
    return Number(total);
  }

  async getById(id: number) {
    return this.prisma.orm.Customer.where({ id }).first();
  }

  async getByUserId(userId: number) {
    return this.prisma.orm.Customer.where({ userId }).first();
  }

  async getByBridgeCustomerId(bridgeCustomerId: string) {
    return this.prisma.orm.Customer.where({ bridgeCustomerId }).first();
  }

  async getByKycLinkId(kycLinkId: string) {
    return this.prisma.orm.Customer.where({ kycLinkId }).first();
  }

  async create(data: { userId: number; country: string; region?: string | null }) {
    return this.prisma.orm.Customer.create({
      userId: data.userId,
      country: data.country.toUpperCase(),
      region: data.region ? data.region.toUpperCase() : null,
    });
  }

  async update(id: number, data: CustomerUpdate) {
    const row = await this.prisma.orm.Customer.where({ id }).update(data as any);
    if (!row) throw new Error(`Customer ${id} not found`);
    return row as CustomerRow;
  }

  /** Blocks the customer app and new payouts; deposits already at Bridge still settle. */
  async suspend(id: number, reason: string, ctx: Context) {
    const customer = await this.getById(id);
    if (!customer) throw new NotFoundError('Customer');
    if (customer.status === CustomerStatus.Suspended) return customer;
    const updated = await this.update(id, {
      status: CustomerStatus.Suspended,
      suspendedAt: new Date(),
    });
    await this.audit.log(ctx, {
      action: 'customer.suspend',
      entity: 'Customer',
      entityId: id,
      before: { status: customer.status },
      after: { status: updated.status, reason },
    });
    return updated;
  }

  async reactivate(id: number, ctx: Context) {
    const customer = await this.getById(id);
    if (!customer) throw new NotFoundError('Customer');
    if (customer.status !== CustomerStatus.Suspended) return customer;
    const status = customer.onboardedAt ? CustomerStatus.Active : CustomerStatus.Onboarding;
    const updated = await this.update(id, { status, suspendedAt: null });
    await this.audit.log(ctx, {
      action: 'customer.reactivate',
      entity: 'Customer',
      entityId: id,
      before: { status: customer.status },
      after: { status },
    });
    return updated;
  }
}
