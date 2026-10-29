import { Container } from 'typedi';

import { defineJob } from '#src/service/queue.js';
import { FeeScheduleService, NOTIFY_FEE_SCHEDULE } from '#src/entity/fee/feeSchedule.service.js';

import { resolveJobId } from './legacyId.js';

/** 00:00 UTC on the 1st (display statuses only; `effectivePeriod` decides the fee). */
export const feeScheduleRollover = defineJob({
  name: 'fee-schedule-rollover',
  queue: { policy: 'exclusive', retryLimit: 5, retryDelay: 60 },
  cron: '0 0 1 * *',
  handler: async () => {
    await Container.get(FeeScheduleService).rollover();
  },
});

export const notifyFeeSchedule = defineJob<{ scheduleId: string | number }>({
  name: NOTIFY_FEE_SCHEDULE,
  queue: { policy: 'exclusive', retryLimit: 2, expireInSeconds: 3600 },
  handler: async (data) => {
    const scheduleId = await resolveJobId('FeeSchedule', data.scheduleId);
    if (!scheduleId) return;
    const sent = await Container.get(FeeScheduleService).notifyCustomers(scheduleId);
    console.info(`[jobs] fee schedule ${scheduleId}: notified ${sent} customers`);
  },
});
