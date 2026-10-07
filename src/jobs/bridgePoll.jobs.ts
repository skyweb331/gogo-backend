import { Container } from 'typedi';

import { config } from '#src/config.js';
import { defineJob } from '#src/service/queue.js';
import { BridgeService, type BridgeVirtualAccountEvent } from '#src/service/bridge/index.js';
import { AppSettingService } from '#src/entity/appSetting/appSetting.service.js';
import { WebhookEventService } from '#src/entity/webhookEvent/webhookEvent.service.js';

const CURSOR_KEY = 'bridge.vaHistory.updatedAfterMs';
const OVERLAP_MS = 10 * 60 * 1000;
const FIRST_RUN_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 100;
const MAX_PAGES = 50;

/**
 * Virtual account activity is polled and fed through the webhook pipeline as synthetic
 * events (`poll:va:<activityId>`), so sandbox (no payment webhooks) and production
 * reconciliation share the webhook code path. Processing is idempotent per activity.
 */
export const pollVirtualAccountActivity = defineJob({
  name: 'poll-virtual-account-activity',
  queue: { policy: 'exclusive', retryLimit: 0, expireInSeconds: 600 },
  cron: `*/${config.BRIDGE_POLL_INTERVAL_MINUTES} * * * *`,
  handler: async () => {
    const bridge = Container.get(BridgeService);
    if (!bridge.configured) return;
    const settings = Container.get(AppSettingService);
    const webhooks = Container.get(WebhookEventService);

    const startedAt = Date.now();
    const last = await settings.get<number>(CURSOR_KEY, startedAt - FIRST_RUN_LOOKBACK_MS);
    const updatedAfter = Math.max(0, last - OVERLAP_MS);

    let startingAfter: string | undefined;
    let seen = 0;
    let created = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data } = await bridge.virtualAccounts.allHistory({
        limit: PAGE_SIZE,
        updated_after_ms: updatedAfter,
        starting_after: startingAfter,
      });
      for (const activity of data) {
        seen++;
        if (await ingestActivity(webhooks, activity)) created++;
      }
      if (data.length < PAGE_SIZE) break;
      startingAfter = data[data.length - 1]!.id;
    }

    await settings.set(CURSOR_KEY, startedAt);
    if (created) console.info(`[poll] virtual account activity: ${created} new of ${seen}`);
  },
});

async function ingestActivity(webhooks: WebhookEventService, activity: BridgeVirtualAccountEvent) {
  const { record, created } = await webhooks.ingest({
    api_version: 'v0',
    event_id: `poll:va:${activity.id}`,
    event_category: 'virtual_account.activity',
    event_type: 'virtual_account.activity.created',
    event_object_id: activity.id,
    event_object_status: activity.type,
    event_object: activity,
    event_created_at: activity.created_at ?? new Date().toISOString(),
  });
  if (created) await webhooks.enqueue(record.id);
  return created;
}
