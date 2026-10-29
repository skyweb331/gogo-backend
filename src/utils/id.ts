const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_PATTERN.test(value);

/**
 * The integer id from before the UUID switch, as found in tokens, queued jobs, Bridge
 * references and email links issued earlier. Rows keep it in `legacyId`.
 */
export const legacyIdOf = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value)) return Number(value);
  return null;
};

/** `where` for a row addressed by either its UUID or its legacy integer id. */
export const idOrLegacy = (value: string | number) => {
  const legacyId = legacyIdOf(value);
  return legacyId === null ? { id: String(value) } : { legacyId };
};
