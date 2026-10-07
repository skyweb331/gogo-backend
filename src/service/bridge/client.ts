import crypto from 'node:crypto';
import { Service } from 'typedi';
import * as Sentry from '@sentry/node';

import { config, isProduction } from '#src/config.js';

export class BridgeApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
    readonly path: string,
    readonly body?: unknown
  ) {
    super(`Bridge ${status} ${code ?? ''} on ${path}: ${message}`.replace(/\s+/g, ' '));
    this.name = 'BridgeApiError';
  }

  /** Worth retrying later (rate limit, Bridge outage, network). */
  get retryable() {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

export interface BridgeRequestOptions {
  query?: Record<string, string | number | boolean | undefined | string[]>;
  body?: unknown;
  /**
   * Required for POST/PUT so retries can't create duplicates. Use a deterministic key
   * for business operations (e.g. `payout-<transactionId>`).
   */
  idempotencyKey?: string;
  /** Max attempts for retryable failures (default 3). */
  attempts?: number;
  timeoutMs?: number;
}

const SENSITIVE_FIELDS =
  /tax_identification_number|birth_date|api.?key|signed_agreement_id|iban|account_number/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [
      k,
      SENSITIVE_FIELDS.test(k) ? '[redacted]' : redact(v, depth + 1),
    ])
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Low-level Bridge HTTP client.
 * - Base URL / key come from env (`BRIDGE_ENV`, `BRIDGE_API_URL`, `BRIDGE_API_KEY`); going
 *   live is an env change only.
 * - Every mutating request carries an `Idempotency-Key`.
 * - Retries 429 / 5xx / network errors with exponential backoff + jitter.
 * - Logs method, path, status and latency; bodies only in development, redacted.
 */
@Service()
export class BridgeClient {
  readonly baseUrl = config.BRIDGE_API_URL.replace(/\/+$/, '');

  get configured() {
    return Boolean(config.BRIDGE_API_KEY) && !/^sk-(test|live)-x+$/i.test(config.BRIDGE_API_KEY);
  }

  assertConfigured() {
    if (!this.configured) {
      throw new Error('BRIDGE_API_KEY is not configured');
    }
    if (
      isProduction &&
      config.BRIDGE_ENV === 'production' &&
      config.BRIDGE_API_KEY.startsWith('sk-test')
    ) {
      throw new Error('A sandbox Bridge key is configured with BRIDGE_ENV=production');
    }
  }

  async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    options: BridgeRequestOptions = {}
  ) {
    this.assertConfigured();

    const url = new URL(`${this.baseUrl}/v0${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value === undefined) continue;
      if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(`${key}[]`, v));
      else url.searchParams.set(key, String(value));
    }

    const mutating = method !== 'GET';
    const idempotencyKey = mutating ? (options.idempotencyKey ?? crypto.randomUUID()) : undefined;
    const maxAttempts = options.attempts ?? 3;

    let lastError: BridgeApiError | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const started = Date.now();
      let status = 0;
      try {
        const response = await fetch(url, {
          method,
          headers: {
            'Api-Key': config.BRIDGE_API_KEY,
            Accept: 'application/json',
            ...(options.body !== undefined && { 'Content-Type': 'application/json' }),
            ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey }),
          },
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
        });
        status = response.status;
        const text = await response.text();
        const json = text ? safeJson(text) : undefined;
        this.log(method, url, status, Date.now() - started, attempt, options.body);

        if (response.ok) return json as T;

        const err = json as
          { code?: string; message?: string; errors?: { message?: string }[] } | undefined;
        lastError = new BridgeApiError(
          status,
          err?.code,
          err?.message ?? err?.errors?.[0]?.message ?? response.statusText,
          path,
          json
        );
      } catch (error) {
        if (error instanceof BridgeApiError) throw error;
        this.log(method, url, status, Date.now() - started, attempt, options.body, error);
        lastError = new BridgeApiError(0, 'network', (error as Error).message, path);
      }

      if (!lastError.retryable || attempt === maxAttempts) break;
      const backoff = Math.min(8000, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
      await sleep(backoff);
    }

    Sentry.addBreadcrumb({
      category: 'bridge',
      level: 'error',
      message: `${method} ${path} -> ${lastError!.status}`,
    });
    throw lastError!;
  }

  get<T>(path: string, options?: BridgeRequestOptions) {
    return this.request<T>('GET', path, options);
  }

  post<T>(path: string, body: unknown, options?: Omit<BridgeRequestOptions, 'body'>) {
    return this.request<T>('POST', path, { ...options, body });
  }

  put<T>(path: string, body: unknown, options?: Omit<BridgeRequestOptions, 'body'>) {
    return this.request<T>('PUT', path, { ...options, body });
  }

  delete<T>(path: string, options?: BridgeRequestOptions) {
    return this.request<T>('DELETE', path, options);
  }

  private log(
    method: string,
    url: URL,
    status: number,
    ms: number,
    attempt: number,
    body?: unknown,
    error?: unknown
  ) {
    const line = `[bridge] ${method} ${url.pathname}${url.search} -> ${status || 'ERR'} ${ms}ms${attempt > 1 ? ` (attempt ${attempt})` : ''}`;
    if (error) console.warn(`${line} ${(error as Error).message}`);
    else if (status >= 400) console.warn(line);
    else console.log(line);
    if (!isProduction && body !== undefined && config.BRIDGE_LOG_BODIES) {
      console.log('[bridge] body', JSON.stringify(redact(body)));
    }
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 500) };
  }
}
