import { Container } from 'typedi';

import { defineJob } from '#src/service/queue.js';
import {
  PROCESS_WEBHOOK_EVENT,
  WebhookEventService,
} from '#src/entity/webhookEvent/webhookEvent.service.js';

import { resolveJobId } from './legacyId.js';

export const processWebhookEvent = defineJob<{ id: string | number }>({
  name: PROCESS_WEBHOOK_EVENT,
  queue: { policy: 'exclusive' },
  work: { localConcurrency: 4 },
  handler: async (data) => {
    const id = await resolveJobId('WebhookEvent', data.id);
    if (id) await Container.get(WebhookEventService).process(id);
  },
});

export const sweepWebhookEvents = defineJob({
  name: 'sweep-webhook-events',
  queue: { policy: 'exclusive', retryLimit: 0 },
  cron: '*/5 * * * *',
  handler: async () => {
    const count = await Container.get(WebhookEventService).sweep();
    if (count) console.info(`[jobs] re-enqueued ${count} webhook events`);
  },
});
