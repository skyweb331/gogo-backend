/**
 * Tiered, marginal monthly fee. Pure functions only: no database, no config, no
 * hard-coded limits or rates. Tiers come from the FeeSchedule in effect for the
 * deposit's period; amounts are integer cents (USD equivalent), rates are bps.
 */

export interface Tier {
  position: number;
  fromInCents: bigint;
  /** null = no upper limit */
  toInCents: bigint | null;
  rateBps: number;
}

export interface BreakdownLine extends Tier {
  /** Part of this deposit that falls inside the tier */
  amountInCents: bigint;
  feeInCents: bigint;
}

export interface FeeResult {
  feeInCents: bigint;
  breakdown: BreakdownLine[];
}

const BPS = 10_000n;

const maxBig = (a: bigint, b: bigint) => (a > b ? a : b);
const minBig = (a: bigint, b: bigint) => (a < b ? a : b);

/**
 * Charges each slice of `[prevVolume, prevVolume + amount)` at its tier's rate,
 * rounding each tier half-up to the cent.
 */
export function calculateTieredFee(
  prevVolumeInCents: bigint,
  amountInCents: bigint,
  tiers: Tier[]
): FeeResult {
  if (amountInCents <= 0n) return { feeInCents: 0n, breakdown: [] };
  const start = prevVolumeInCents < 0n ? 0n : prevVolumeInCents;
  const end = start + amountInCents;

  let feeInCents = 0n;
  const breakdown: BreakdownLine[] = [];
  for (const tier of [...tiers].sort((a, b) => a.position - b.position)) {
    const lo = maxBig(start, tier.fromInCents);
    const hi = tier.toInCents === null ? end : minBig(end, tier.toInCents);
    if (hi <= lo) continue;
    const slice = hi - lo;
    const fee = (slice * BigInt(tier.rateBps) + BPS / 2n) / BPS;
    feeInCents += fee;
    breakdown.push({ ...tier, amountInCents: slice, feeInCents: fee });
  }
  return { feeInCents, breakdown };
}

export interface CappedFee {
  feeInCents: bigint;
  /** True when the fee was lowered so the payout still meets the minimum */
  capped: boolean;
  /** False when the payout base itself is below the minimum (no transfer possible) */
  payable: boolean;
}

/** Keeps `payoutBase - fee >= minimum`; never raises the fee. */
export function capFeeForMinimum(
  feeInCents: bigint,
  payoutBaseInCents: bigint,
  minimumInCents: bigint
): CappedFee {
  if (payoutBaseInCents < minimumInCents)
    return { feeInCents: 0n, capped: feeInCents > 0n, payable: false };
  const maxFee = payoutBaseInCents - minimumInCents;
  if (feeInCents > maxFee) return { feeInCents: maxFee, capped: true, payable: true };
  return { feeInCents, capped: false, payable: true };
}

/** Effective rate of a fee on an amount, in bps (rounded). */
export function effectiveRateBps(feeInCents: bigint, amountInCents: bigint): number {
  if (amountInCents <= 0n) return 0;
  return Number((feeInCents * BPS + amountInCents / 2n) / amountInCents);
}
