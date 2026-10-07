import { isBridgeSandbox } from '#src/config.js';

/** Block explorer link for a payout transaction hash. */
export function explorerTxUrl(
  chain: string | null | undefined,
  txHash: string | null | undefined
): string | null {
  if (!txHash || !chain) return null;
  if (chain === 'base')
    return `https://${isBridgeSandbox ? 'sepolia.' : ''}basescan.org/tx/${txHash}`;
  if (chain === 'solana')
    return `https://solscan.io/tx/${txHash}${isBridgeSandbox ? '?cluster=devnet' : ''}`;
  return null;
}
