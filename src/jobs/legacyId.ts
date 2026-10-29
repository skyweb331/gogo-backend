/**
 * Jobs queued before the UUID switch carry integer ids. Those rows are no longer
 * addressable, so the job is skipped instead of being applied to the wrong record.
 */
export const resolveJobId = (model: string, value: string | number): string | null => {
  if (typeof value === 'number' || /^[1-9]\d{0,9}$/.test(String(value))) {
    console.warn(`[jobs] skipping ${model} job queued with integer id ${value}`);
    return null;
  }
  return String(value);
};
