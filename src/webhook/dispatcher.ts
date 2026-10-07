import { Service } from 'typedi';

import type { BridgeWebhookEvent } from '#src/service/bridge/index.js';

/** `ignored` marks events that need no action (unknown type, stale update, ...). */
export type WebhookOutcome = 'processed' | 'ignored';
export type WebhookHandler = (event: BridgeWebhookEvent<any>) => Promise<WebhookOutcome>;

/** Maps Bridge `event_category` to the module that owns it. */
@Service()
export class WebhookDispatcher {
  private readonly handlers = new Map<string, WebhookHandler>();

  on(category: string, handler: WebhookHandler) {
    this.handlers.set(category, handler);
  }

  async dispatch(event: BridgeWebhookEvent<any>): Promise<WebhookOutcome> {
    const handler = this.handlers.get(event.event_category);
    if (!handler) return 'ignored';
    return handler(event);
  }
}
