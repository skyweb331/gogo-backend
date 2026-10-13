/**
 * Fee schedule rules, shared verbatim with nxpay-admin
 * (`nxpay-admin/src/sections/FeeSchedule/feeRules.ts`); keep both copies identical.
 * Only depends on zod, amounts are integer cents as bigint.
 */
import { z } from 'zod';

export const MAX_RATE_BPS = 10_000;
export const MAX_TIERS = 20;

export const feeTierSchema = z.object({
  fromInCents: z.bigint().nonnegative(),
  toInCents: z.bigint().positive().nullable(),
  rateBps: z
    .number()
    .int('Rates are whole basis points (0.01%)')
    .min(0, 'Rate cannot be negative')
    .max(MAX_RATE_BPS, 'Rate cannot exceed 100%'),
});

export type FeeTierValue = z.infer<typeof feeTierSchema>;

export const feeTiersSchema = z
  .array(feeTierSchema)
  .min(1, 'Add at least one tier')
  .max(MAX_TIERS, `Use at most ${MAX_TIERS} tiers`)
  .superRefine((tiers, ctx) => {
    tiers.forEach((tier, index) => {
      const path = [index];
      if (index === 0 && tier.fromInCents !== 0n) {
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'fromInCents'],
          message: 'The first tier must start at $0',
        });
      }
      if (index > 0) {
        const prev = tiers[index - 1]!;
        if (prev.toInCents === null || tier.fromInCents !== prev.toInCents) {
          ctx.addIssue({
            code: 'custom',
            path: [...path, 'fromInCents'],
            message: 'Each tier must start where the previous one ends',
          });
        }
      }
      const last = index === tiers.length - 1;
      if (!last && tier.toInCents === null) {
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'toInCents'],
          message: 'Only the last tier can be open-ended',
        });
      }
      if (last && tier.toInCents !== null) {
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'toInCents'],
          message: 'The last tier must be open-ended',
        });
      }
      if (tier.toInCents !== null && tier.toInCents <= tier.fromInCents) {
        ctx.addIssue({
          code: 'custom',
          path: [...path, 'toInCents'],
          message: 'The upper limit must be above the lower limit',
        });
      }
    });
  });

const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

const periodKeyOf = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

/** First month a new schedule may take effect: next month (UTC). */
export function earliestEffectivePeriod(now = new Date()) {
  return periodKeyOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)));
}

export const effectivePeriodSchema = (now = new Date()) =>
  z
    .string()
    .regex(PERIOD_RE, 'Choose a month')
    .refine(
      (p) => p >= earliestEffectivePeriod(now),
      'Changes can start next month at the earliest'
    );

/** Tiers whose rate is above the soft cap (the editor warns, the backend allows). */
export const tiersAboveSoftCap = (tiers: FeeTierValue[], softCapBps: number) =>
  tiers.map((t, i) => (t.rateBps > softCapBps ? i : -1)).filter((i) => i >= 0);
