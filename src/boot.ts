import { Container } from 'typedi';

import { PrismaService } from './service/prisma.js';
import { QueueService } from './service/queue.js';
import { MailerService } from './service/mailer.js';
import { KeyVault } from './service/keyVault.js';
import { jobs } from './jobs/index.js';
import { registerWebhookHandlers } from './webhook/handlers.js';
import { FeeScheduleService } from './entity/fee/feeSchedule.service.js';

/** Startup checks and background services, run after the schema is built. */
export async function boot() {
  Container.get(MailerService).assertConfigured();
  await Container.get(KeyVault).selfCheck();
  registerWebhookHandlers();
  await Container.get(FeeScheduleService).rollover();

  const queue = Container.get(QueueService);
  queue.register(jobs);
  await queue.start();
}

export async function shutdown() {
  await Container.get(QueueService).stop();
  await Container.get(PrismaService).close();
}
