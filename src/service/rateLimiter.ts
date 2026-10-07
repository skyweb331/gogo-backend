import { Service } from 'typedi';

import { RateLimitError } from '#src/utils/errors.js';

/**
 * In-process sliding-window limiter for GraphQL operations that share one HTTP endpoint
 * (login, OTP requests, password reset). Single backend instance; persistent limits
 * that must survive restarts (wallet key exports per day) are counted in the database.
 */
@Service()
export class RateLimiterService {
  private readonly hits = new Map<string, number[]>();

  constructor() {
    setInterval(() => this.sweep(), 60_000).unref();
  }

  /** Records a hit and throws when more than `limit` hits happened within `windowMs`. */
  consume(key: string, limit: number, windowMs: number, message?: string) {
    const now = Date.now();
    const list = (this.hits.get(key) ?? []).filter((t) => t > now - windowMs);
    if (list.length >= limit) {
      this.hits.set(key, list);
      throw new RateLimitError(message);
    }
    list.push(now);
    this.hits.set(key, list);
  }

  reset(key: string) {
    this.hits.delete(key);
  }

  private sweep() {
    const cutoff = Date.now() - 24 * 60 * 60_000;
    for (const [key, list] of this.hits) {
      const kept = list.filter((t) => t > cutoff);
      if (kept.length) this.hits.set(key, kept);
      else this.hits.delete(key);
    }
  }
}
