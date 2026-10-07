/** Fee periods are calendar months in UTC, keyed `YYYY-MM`. */

const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export const isPeriodKey = (value: string) => PERIOD_RE.test(value);

export function periodKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export const currentPeriodKey = () => periodKeyOf(new Date());

export function addMonths(periodKey: string, months: number): string {
  const match = PERIOD_RE.exec(periodKey);
  if (!match) throw new Error(`Invalid period: ${periodKey}`);
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + months, 1));
  return periodKeyOf(d);
}

export const nextPeriodKey = () => addMonths(currentPeriodKey(), 1);

/** Lexicographic compare works for YYYY-MM. */
export const comparePeriods = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function periodStart(periodKey: string): Date {
  const match = PERIOD_RE.exec(periodKey);
  if (!match) throw new Error(`Invalid period: ${periodKey}`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
}

export function formatPeriod(periodKey: string): string {
  return periodStart(periodKey).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
