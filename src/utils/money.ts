/** Money helpers. All amounts are integer cents (bigint); rates are basis points. */

export const BPS_DENOMINATOR = 10_000n;

export const minBig = (a: bigint, b: bigint) => (a < b ? a : b);
export const maxBig = (a: bigint, b: bigint) => (a > b ? a : b);

/**
 * "123.45" | "123.4" | "123" -> 12345n. Rejects more than 2 decimals unless `round`
 * is set (`true` = half-up, `'floor'` = truncate, e.g. for wallet balances).
 */
export function decimalToCents(
  value: string | number,
  { round = false }: { round?: boolean | 'floor' } = {}
): bigint {
  const str = typeof value === 'number' ? value.toString() : value.trim();
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(str);
  if (!match) throw new Error(`Invalid decimal amount: ${value}`);
  const [, sign, whole, fraction = ''] = match;
  let cents = BigInt(whole!) * 100n;
  if (fraction.length <= 2) {
    cents += BigInt(fraction.padEnd(2, '0') || '0');
  } else if (round) {
    const head = BigInt(fraction.slice(0, 2));
    const roundUp = round !== 'floor' && Number(fraction[2]) >= 5;
    cents += head + (roundUp ? 1n : 0n);
  } else {
    throw new Error(`Amount has more than 2 decimals: ${value}`);
  }
  return sign ? -cents : cents;
}

/** 12345n -> "123.45" */
export function centsToDecimal(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

/** Multiplies cents by a decimal rate string (e.g. FX "1.0842") with half-up rounding. */
export function multiplyByDecimal(cents: bigint, rate: string): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(rate.trim());
  if (!match) throw new Error(`Invalid rate: ${rate}`);
  const fraction = match[2] ?? '';
  const scale = 10n ** BigInt(fraction.length);
  const rateInt = BigInt(match[1]! + fraction);
  return (cents * rateInt + scale / 2n) / scale;
}

/** Divides cents by a decimal rate string (e.g. USD fee -> EUR at "1.0842") with half-up rounding. */
export function divideByDecimal(cents: bigint, rate: string): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(rate.trim());
  if (!match) throw new Error(`Invalid rate: ${rate}`);
  const fraction = match[2] ?? '';
  const scale = 10n ** BigInt(fraction.length);
  const rateInt = BigInt(match[1]! + fraction);
  if (rateInt === 0n) throw new Error('Rate cannot be zero');
  return (cents * scale + rateInt / 2n) / rateInt;
}

/** "$5,000 – $10,000" style label for a tier range. */
export function formatRange(
  fromInCents: bigint,
  toInCents: bigint | null,
  currency = 'usd'
): string {
  return toInCents === null
    ? `${formatMoney(fromInCents, currency)}+`
    : `${formatMoney(fromInCents, currency)} – ${formatMoney(toInCents, currency)}`;
}

const groupThousands = (cents: bigint) => {
  const [whole, fraction] = centsToDecimal(cents).split('.');
  return `${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
};

export function formatMoney(cents: bigint, currency: 'usd' | 'eur' | string = 'usd'): string {
  return `${currency === 'eur' ? '€' : '$'}${groupThousands(cents)}`;
}

/** "5,950.00 USDC" */
export function formatToken(cents: bigint, token: string): string {
  return `${groupThousands(cents)} ${token.toUpperCase()}`;
}

export function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}
