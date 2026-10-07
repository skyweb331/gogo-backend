import * as Sentry from '@sentry/node';
import { PgBoss } from 'pg-boss';
import type { Job, Queue, SendOptions, WorkOptions } from 'pg-boss';
import { Service } from 'typedi';

import { config } from '#src/config.js';

export type JobHandler<T extends object> = (data: T, job: Job<T>) => Promise<void>;

export interface JobDefinition<T extends object = object> {
  name: string;
  handler: JobHandler<T>;
  queue?: Omit<Queue, 'name'>;
  work?: Pick<WorkOptions, 'localConcurrency' | 'groupConcurrency' | 'pollingIntervalSeconds'>;
  /** UTC cron expression; the job is sent with empty data on each tick */
  cron?: string;
}

export const DEFAULT_QUEUE_OPTIONS: Omit<Queue, 'name'> = {
  retryLimit: 5,
  retryDelay: 15,
  retryBackoff: true,
  retryDelayMax: 900,
  expireInSeconds: 300,
};

export function defineJob<T extends object>(definition: JobDefinition<T>): JobDefinition<T> {
  return definition;
}

/** pg-boss on the app database (schema `pgboss`); workers run in the API process. */
@Service()
export class QueueService {
  private boss?: PgBoss;
  private readonly definitions = new Map<string, JobDefinition<any>>();
  private started = false;

  get isStarted() {
    return this.started;
  }

  register(definitions: JobDefinition<any>[]) {
    for (const def of definitions) {
      if (this.definitions.has(def.name)) throw new Error(`Duplicate job "${def.name}"`);
      this.definitions.set(def.name, def);
    }
  }

  /** Creates queues and schedules; starts workers only when JOBS_ENABLED. */
  async start() {
    if (this.started) return;
    const boss = new PgBoss({
      connectionString: config.DATABASE_URL,
      schema: 'pgboss',
      application_name: 'gogo-jobs',
    });
    boss.on('error', (error) => {
      console.error('[queue] error', error);
      Sentry.captureException(error);
    });
    await boss.start();
    this.boss = boss;

    for (const def of this.definitions.values()) {
      const existing = await boss.getQueue(def.name);
      const options = { ...DEFAULT_QUEUE_OPTIONS, ...def.queue };
      if (existing) {
        const { policy, partition, ...updatable } = options;
        if ((policy ?? 'standard') !== existing.policy || !!partition !== !!existing.partition) {
          console.warn(
            `[queue] ${def.name}: policy/partition differ from the existing queue; recreate it to apply`
          );
        }
        await boss.updateQueue(def.name, updatable);
      } else {
        await boss.createQueue(def.name, options);
      }

      if (def.cron)
        await boss.schedule(def.name, def.cron, {}, { tz: 'UTC', singletonKey: def.name });
      else await boss.unschedule(def.name).catch(() => undefined);
    }

    if (config.JOBS_ENABLED) {
      for (const def of this.definitions.values()) {
        await boss.work<object>(def.name, { batchSize: 1, ...def.work }, async (jobs) => {
          for (const job of jobs) await this.run(def, job);
        });
      }
    }
    this.started = true;
    console.info(
      `[queue] started (${this.definitions.size} queues, workers ${config.JOBS_ENABLED ? 'on' : 'off'})`
    );
  }

  private async run(def: JobDefinition<any>, job: Job<object>) {
    const startedAt = Date.now();
    try {
      await def.handler(job.data ?? {}, job);
      const ms = Date.now() - startedAt;
      if (ms > 5000) console.warn(`[queue] ${def.name} ${job.id} slow ${ms}ms`);
    } catch (error) {
      console.error(`[queue] ${def.name} ${job.id} failed (retry ${job.retryCount})`, error);
      Sentry.withScope((scope) => {
        scope.setTag('job', def.name);
        scope.setExtra('jobId', job.id);
        scope.setExtra('retryCount', job.retryCount);
        Sentry.captureException(error);
      });
      throw error;
    }
  }

  async send<T extends object>(name: string, data: T, options: SendOptions = {}) {
    if (!this.boss) throw new Error('Queue not started');
    if (!this.definitions.has(name)) throw new Error(`Unknown job "${name}"`);
    return this.boss.send(name, data, options);
  }

  /** Send that never throws; failures are logged and left to the sweepers. */
  async sendSafe<T extends object>(name: string, data: T, options: SendOptions = {}) {
    try {
      return await this.send(name, data, options);
    } catch (error) {
      console.error(`[queue] could not enqueue ${name}`, error);
      Sentry.captureException(error);
      return null;
    }
  }

  async stop() {
    if (!this.boss) return;
    await this.boss.stop({ graceful: true, timeout: 8000 });
    this.boss = undefined;
    this.started = false;
  }
}
