import { Container } from 'typedi';

import { defineJob } from '#src/service/queue.js';
import {
  COMPLETE_ONBOARDING,
  OnboardingService,
} from '#src/entity/onboarding/onboarding.service.js';

export const completeOnboarding = defineJob<{ customerId: string }>({
  name: COMPLETE_ONBOARDING,
  queue: { policy: 'exclusive', retryLimit: 6, retryDelay: 30, retryBackoff: true },
  handler: async ({ customerId }) => {
    await Container.get(OnboardingService).complete(customerId);
  },
});

export const syncDepositAccounts = defineJob({
  name: 'sync-deposit-accounts',
  queue: { policy: 'exclusive', retryLimit: 0, expireInSeconds: 900 },
  cron: '17 * * * *',
  handler: async () => {
    const checked = await Container.get(OnboardingService).syncDepositAccounts();
    if (checked) console.info(`[jobs] deposit account sync: checked ${checked}`);
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
