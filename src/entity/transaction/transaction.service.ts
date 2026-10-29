import { Service } from 'typedi';
import { and } from '@prisma/orm-postgres/orm-client';

import { PrismaService, toJson, type TransactionRow } from '#src/service/prisma.js';
import { TransactionEventSource, TransactionState } from '#src/graphql/enum.js';
import { canTransition } from '#src/state/transaction.stateMachine.js';
import { idOrLegacy } from '#src/utils/id.js';

import type { TransactionQueryArgs } from './transaction.type.js';

export type TransactionPatch = Partial<
  Omit<
    TransactionRow,
    'id' | 'legacyId' | 'reference' | 'customerId' | 'createdAt' | 'updatedAt' | 'version'
  >
>;

const TRANSACTION_LIST = {
  model: 'Transaction',
  filterable: [
    'id',
    'reference',
    'customerId',
    'virtualAccountId',
    'currency',
    'state',
    'rail',
    'periodKey',
    'grossAmountInCents',
    'feeInCents',
    'bridgeDepositId',
    'bridgeTransferId',
    'txHash',
    'fundsReceivedAt',
    'completedAt',
    'createdAt',
  ],
  sortable: [
    'createdAt',
    'fundsReceivedAt',
    'completedAt',
    'grossAmountInCents',
    'feeInCents',
    'state',
  ],
  defaultSort: 'createdAt',
} as const;

@Service()
export class TransactionService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: TransactionQueryArgs): Promise<TransactionRow[]> {
    return query.applyTo(this.prisma.orm.Transaction, TRANSACTION_LIST).all();
  }

  async count(query: TransactionQueryArgs): Promise<number> {
    const { total } = await query
      .applyFilter(this.prisma.orm.Transaction, TRANSACTION_LIST)
      .aggregate((a) => ({ total: a.count() }));
    return Number(total);
  }

  async getById(id: string) {
    return this.prisma.orm.Transaction.where({ id }).first();
  }

  /** Also accepts the integer ids in links from emails sent before the UUID migration. */
  async getByIdOrLegacy(id: string) {
    return this.prisma.orm.Transaction.where(idOrLegacy(id)).first();
  }

  async getByDepositId(bridgeDepositId: string) {
    return this.prisma.orm.Transaction.where({ bridgeDepositId }).first();
  }

  async getByTransferId(bridgeTransferId: string) {
    return this.prisma.orm.Transaction.where({ bridgeTransferId }).first();
  }

  async hasEvent(transactionId: string, source: TransactionEventSource, type: string) {
    const row = await this.prisma.orm.TransactionEvent.where({ transactionId, source, type })
      .select('id')
      .first();
    return !!row;
  }

  async recordEvent(
    transactionId: string,
    source: TransactionEventSource,
    type: string,
    payload?: unknown
  ) {
    return this.prisma.orm.TransactionEvent.create({
      transactionId,
      source,
      type,
      payload: payload === undefined ? null : toJson(payload),
    });
  }

  /**
   * Optimistic update on `version`. A `state` in the patch is applied only when the
   * state machine allows it; other fields are written either way. Returns null when
   * the row changed underneath (caller reloads and retries).
   */
  async update(tx: TransactionRow, patch: TransactionPatch): Promise<TransactionRow | null> {
    const next = { ...patch };
    if (
      next.state !== undefined &&
      next.state !== tx.state &&
      !canTransition(tx.state, next.state)
    ) {
      delete next.state;
    }
    if (next.state === tx.state) delete next.state;
    return this.prisma.orm.Transaction.where({ id: tx.id, version: tx.version }).update({
      ...next,
      version: tx.version + 1,
    });
  }

  /** Reload-and-retry wrapper around `update` for concurrent writers. */
  async mutate(
    id: string,
    fn: (tx: TransactionRow) => TransactionPatch | null
  ): Promise<TransactionRow> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const tx = await this.getById(id);
      if (!tx) throw new Error(`Transaction ${id} not found`);
      const patch = fn(tx);
      if (!patch || Object.keys(patch).length === 0) return tx;
      const updated = await this.update(tx, patch);
      if (updated) return updated;
    }
    throw new Error(`Transaction ${id} kept changing; retry later`);
  }

  async stuck(states: TransactionState[], olderThan: Date, limit = 100) {
    return this.prisma.orm.Transaction.where((t) =>
      and(t.state.in(states), t.updatedAt.lt(olderThan))
    )
      .orderBy((t) => t.updatedAt.asc())
      .limit(limit)
      .all();
  }
}
