import { Service } from 'typedi';

import { PrismaService, toJson } from '#src/service/prisma.js';
import type { Context } from '#src/context.js';

import type { AuditLogQueryArgs } from './auditLog.type.js';

export interface AuditEntry {
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

const AUDIT_LIST = {
  model: 'AuditLog',
  filterable: ['id', 'actorId', 'actorRole', 'action', 'entity', 'entityId', 'ip', 'createdAt'],
  sortable: ['id', 'createdAt', 'action', 'entity'],
  defaultSort: 'createdAt',
} as const;

/** Postgres replacement for limelite's Elasticsearch `Log`. */
@Service()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AuditLogQueryArgs) {
    return query.applyTo(this.prisma.orm.AuditLog, AUDIT_LIST).all();
  }

  async count(query: AuditLogQueryArgs) {
    const { total } = await query
      .applyFilter(this.prisma.orm.AuditLog, AUDIT_LIST)
      .aggregate((a) => ({ total: a.count() }));
    return Number(total);
  }

  async log(ctx: Pick<Context, 'user' | 'ip'> | null, entry: AuditEntry) {
    await this.prisma.orm.AuditLog.create({
      actorId: ctx?.user?.id ?? null,
      actorRole: ctx?.user?.role ?? 'system',
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      before: toJson(entry.before),
      after: toJson(entry.after),
      ip: ctx?.ip ?? null,
    });
  }
}
