import type { JobDefinition } from '#src/service/queue.js';

import { processWebhookEvent, sweepWebhookEvents } from './webhook.jobs.js';
import { pollVirtualAccountActivity } from './bridgePoll.jobs.js';
import { completeOnboarding, syncKycStatus } from './onboarding.jobs.js';
import { feeScheduleRollover, notifyFeeSchedule } from './fee.jobs.js';
import {
  createPayout,
  processDeposit,
  reconcileTransactions,
  retryFailedPayouts,
  syncTransfer,
  syncTransfers,
} from './money.jobs.js';

export const jobs: JobDefinition<any>[] = [
  processDeposit,
  createPayout,
  syncTransfer,
  syncTransfers,
  retryFailedPayouts,
  reconcileTransactions,
  processWebhookEvent,
  sweepWebhookEvents,
  pollVirtualAccountActivity,
  completeOnboarding,
  syncKycStatus,
  feeScheduleRollover,
  notifyFeeSchedule,
];
