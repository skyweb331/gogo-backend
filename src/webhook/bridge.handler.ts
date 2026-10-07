import * as Sentry from '@sentry/node';
import type { Request, Response } from 'express';
import { Container } from 'typedi';

import { config, isProduction } from '#src/config.js';
import type { BridgeWebhookEvent } from '#src/service/bridge/index.js';
import { WebhookEventService } from '#src/entity/webhookEvent/webhookEvent.service.js';

import { verifyBridgeSignature } from './verifySignature.js';

const isEnvelope = (value: unknown): value is BridgeWebhookEvent =>
  !!value &&
  typeof value === 'object' &&
  typeof (value as BridgeWebhookEvent).event_id === 'string' &&
  typeof (value as BridgeWebhookEvent).event_category === 'string' &&
  typeof (value as BridgeWebhookEvent).event_type === 'string';

/**
 * Verify, store, enqueue, 200. Processing happens in `process-webhook-event`, so a slow
 * or failing handler never makes Bridge retry a delivery we already have.
 */
export async function bridgeWebhookHandler(req: Request, res: Response) {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (config.BRIDGE_WEBHOOK_PUBLIC_KEY || isProduction) {
    const result = verifyBridgeSignature(
      raw,
      req.header('x-webhook-signature'),
      config.BRIDGE_WEBHOOK_PUBLIC_KEY
    );
    if (!result.ok) {
      console.warn(`[webhook] rejected: ${result.reason}`);
      if (result.reason === 'no_public_key') {
        res.status(503).json({ error: 'webhooks not configured' });
        return;
      }
      res.status(400).json({ error: result.reason });
      return;
    }
  } else {
    console.warn(
      '[webhook] BRIDGE_WEBHOOK_PUBLIC_KEY not set; accepting unsigned delivery (development only)'
    );
  }

  let event: unknown;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    res.status(400).json({ error: 'invalid_json' });
    return;
  }
  if (!isEnvelope(event)) {
    res.status(400).json({ error: 'invalid_event' });
    return;
  }

  try {
    const service = Container.get(WebhookEventService);
    const { record, created } = await service.ingest(event);
    if (created) await service.enqueue(record.id);
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('[webhook] could not store event', error);
    Sentry.captureException(error);
    res.status(500).json({ error: 'internal' });
  }
}
