import { Container } from 'typedi';

import { defineJob } from '#src/service/queue.js';
import {
  COMPLETE_ONBOARDING,
  OnboardingService,
} from '#src/entity/onboarding/onboarding.service.js';

import { resolveJobId } from './legacyId.js';

export const completeOnboarding = defineJob<{ customerId: string | number }>({
  name: COMPLETE_ONBOARDING,
  queue: { policy: 'exclusive', retryLimit: 6, retryDelay: 30, retryBackoff: true },
  handler: async (data) => {
    const customerId = await resolveJobId('Customer', data.customerId);
    if (customerId) await Container.get(OnboardingService).complete(customerId);
  },
});

export const syncKycStatus = defineJob({
  name: 'sync-kyc-status',
  queue: { policy: 'exclusive', retryLimit: 0, expireInSeconds: 600 },
  cron: '*/5 * * * *',
  handler: async () => {
    const { refreshed, finalized } = await Container.get(OnboardingService).syncPending();
    if (refreshed || finalized)
      console.info(`[jobs] kyc sync: refreshed ${refreshed}, finalizing ${finalized}`);
  },
});
