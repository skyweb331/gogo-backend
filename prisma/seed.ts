import 'reflect-metadata';
import { Container } from 'typedi';

import { PrismaService } from '#src/service/prisma.js';
import { FeeScheduleStatus, UserRole } from '#src/graphql/enum.js';
import { hashPassword } from '#src/utils/auth.js';
import { currentPeriodKey, isPeriodKey } from '#src/utils/period.js';

/**
 * Idempotent seed:
 * - super admin (SEED_ADMIN_*), who sets up TOTP on first admin sign-in
 * - the launch fee schedule. These starting tiers exist only here; afterwards the
 *   schedule is data that admins edit from the admin console.
 * - default app settings
 */
const DEFAULT_TIERS = [
  { fromInCents: 0n, toInCents: 500_000n, rateBps: 0 },
  { fromInCents: 500_000n, toInCents: 1_000_000n, rateBps: 500 },
  { fromInCents: 1_000_000n, toInCents: null, rateBps: 1000 },
];

const DEFAULT_SETTINGS: Record<string, unknown> = {
  // The fee editor warns above this rate (basis points)
  'fee.softCapBps': 2000,
};

async function main() {
  const prisma = Container.get(PrismaService);
  const orm = prisma.orm;

  try {
    const email = (process.env['SEED_ADMIN_EMAIL'] ?? '').trim().toLowerCase();
    const password = process.env['SEED_ADMIN_PASSWORD'] ?? '';
    if (email && password) {
      const existing = await orm.User.where({ email }).first();
      if (!existing) {
        await orm.User.create({
          email,
          name: process.env['SEED_ADMIN_NAME'] || 'GOGO Admin',
          password: await hashPassword(password),
          role: UserRole.Admin,
          isEmailVerified: true,
        });
        console.log(`[seed] created admin ${email}`);
      } else {
        console.log(`[seed] admin ${email} already exists`);
      }
    } else {
      console.log('[seed] SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set, skipping admin');
    }

    const anySchedule = await orm.FeeSchedule.first();
    if (!anySchedule) {
      const configured = process.env['SEED_FEE_EFFECTIVE_PERIOD'];
      const effectivePeriod =
        configured && isPeriodKey(configured) ? configured : currentPeriodKey();
      await prisma.transaction(async () => {
        const schedule = await prisma.orm.FeeSchedule.create({
          effectivePeriod,
          status: FeeScheduleStatus.Active,
          notes: 'Launch fee schedule',
          notifyCustomers: false,
          publishedAt: new Date(),
        });
        await prisma.orm.FeeTier.createAll(
          DEFAULT_TIERS.map((tier, position) => ({ ...tier, position, feeScheduleId: schedule.id }))
        );
      });
      console.log(`[seed] created launch fee schedule effective ${effectivePeriod}`);
    } else {
      console.log('[seed] fee schedule already exists');
    }

    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      const existing = await orm.AppSetting.where({ key }).first();
      if (!existing) {
        await orm.AppSetting.create({ key, value: value as any });
      }
    }
    console.log('[seed] done');
  } finally {
    await prisma.close();
  }
}

main().catch((error) => {
  console.error('[seed] failed', error);
  process.exit(1);
});
