import { Container } from 'typedi';

import { config } from '#src/config.js';
import { QueueService, defineJob } from '#src/service/queue.js';
import { BridgeService } from '#src/service/bridge/index.js';
import { PROCESS_DEPOSIT } from '#src/entity/transaction/deposit.service.js';
import {
  CREATE_PAYOUT,
  PayoutService,
  SYNC_TRANSFER,
} from '#src/entity/transaction/payout.service.js';

/** Fee + volume; one at a time per customer so tier boundaries are applied in order. */
export const processDeposit = defineJob<{ transactionId: string }>({
  name: PROCESS_DEPOSIT,
  queue: { policy: 'exclusive', retryLimit: 10, retryDelay: 30, retryBackoff: true },
  work: { localConcurrency: 4, groupConcurrency: 1 },
  handler: async ({ transactionId }) => {
    await Container.get(PayoutService).processDeposit(transactionId);
  },
});

/** Retries cover the custodial balance not having landed yet and Bridge outages. */
export const createPayout = defineJob<{ transactionId: string }>({
  name: CREATE_PAYOUT,
  queue: {
    policy: 'exclusive',
    retryLimit: 20,
    retryDelay: 60,
    retryBackoff: true,
    retryDelayMax: 1800,
  },
  work: { localConcurrency: 4 },
  handler: async ({ transactionId }) => {
    await Container.get(PayoutService).createPayout(transactionId);
  },
});

export const syncTransfer = defineJob<{ transactionId: string }>({
  name: SYNC_TRANSFER,
  queue: { policy: 'exclusive', retryLimit: 3 },
  work: { localConcurrency: 4 },
  handler: async ({ transactionId }) => {
    await Container.get(PayoutService).syncTransfer(transactionId);
  },
});

export const syncTransfers = defineJob({
  name: 'sync-transfers',
  queue: { policy: 'exclusive', retryLimit: 0 },
  cron: `*/${config.BRIDGE_POLL_INTERVAL_MINUTES} * * * *`,
  handler: async () => {
    if (!Container.get(BridgeService).configured) return;
    const payouts = Container.get(PayoutService);
    const queue = Container.get(QueueService);
    for (const tx of await payouts.inFlight()) {
      await queue.sendSafe(
        SYNC_TRANSFER,
        { transactionId: tx.id },
        { singletonKey: `sync-${tx.id}` }
      );
    }
  },
});

export const retryFailedPayouts = defineJob({
  name: 'retry-failed-payouts',
  queue: { policy: 'exclusive', retryLimit: 0 },
  cron: '*/15 * * * *',
  handler: async () => {
    const { retried, recovered } = await Container.get(PayoutService).retryDue();
    if (retried || recovered)
      console.info(`[jobs] payouts: retrying ${retried}, recovered ${recovered}`);
  },
});

export const reconcileTransactions = defineJob({
  name: 'reconcile-transactions',
  queue: { policy: 'exclusive', retryLimit: 0, expireInSeconds: 900 },
  cron: '30 6 * * *',
  handler: async () => {
    await Container.get(PayoutService).reconcile();
  },
});
