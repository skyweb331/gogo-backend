/** Groups rows by key, preserving the order of `keys` (DataLoader contract). */
export function groupBy<K, R>(keys: readonly K[], rows: R[], keyOf: (row: R) => K): R[][] {
  const map = new Map<K, R[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return keys.map((key) => map.get(key) ?? []);
}

/** Maps rows by key, preserving the order of `keys`; missing keys resolve to null. */
export function indexBy<K, R>(keys: readonly K[], rows: R[], keyOf: (row: R) => K): (R | null)[] {
  const map = new Map<K, R>();
  for (const row of rows) map.set(keyOf(row), row);
  return keys.map((key) => map.get(key) ?? null);
}

export const uniq = <T>(values: readonly T[]) => [...new Set(values)];
