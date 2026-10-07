import * as Sentry from '@sentry/node';

import { config } from '#src/config.js';

const SENSITIVE_KEYS = /password|otp|privateKey|secret|token|authorization|apiKey|api-key|cookie/i;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEYS.test(key) ? '[redacted]' : scrub(v, depth + 1);
  }
  return out;
}

if (config.SENTRY_DSN) {
  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: `${config.NODE_ENV}-${config.BRIDGE_ENV}`,
    tracesSampleRate: 0,
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [] },
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
        // GraphQL bodies can carry passwords, OTPs and exported keys
        delete event.request.data;
      }
      if (event.extra) event.extra = scrub(event.extra) as typeof event.extra;
      if (event.contexts) event.contexts = scrub(event.contexts) as typeof event.contexts;
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'http' || breadcrumb.category === 'fetch') {
        if (breadcrumb.data) delete breadcrumb.data['body'];
      }
      return breadcrumb;
    },
  });
}
