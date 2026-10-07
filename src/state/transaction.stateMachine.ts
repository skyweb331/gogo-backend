import { TransactionState as S } from '#src/graphql/enum.js';
import {
  TRANSFER_TERMINAL_FAILURE,
  TRANSFER_TERMINAL_SUCCESS,
} from '#src/service/bridge/transfer.js';

/**
 * Received (funds_received) -> Converting (payment_submitted) -> Credited (payment_processed
 * into the custodial wallet) -> PayoutPending (fee calculated, transfer created) ->
 * PayoutSubmitted -> Completed. Side states: InReview, Refunded, PayoutFailed.
 */
const TRANSITIONS: Record<S, S[]> = {
  [S.Received]: [S.Converting, S.Credited, S.InReview, S.Refunded],
  [S.Converting]: [S.Credited, S.InReview, S.Refunded],
  [S.InReview]: [S.Converting, S.Credited, S.Refunded],
  [S.Credited]: [S.PayoutPending, S.PayoutSubmitted, S.Completed, S.PayoutFailed],
  [S.PayoutPending]: [S.PayoutSubmitted, S.Completed, S.PayoutFailed],
  [S.PayoutSubmitted]: [S.Completed, S.PayoutFailed],
  [S.PayoutFailed]: [S.PayoutPending, S.PayoutSubmitted, S.Completed],
  [S.Completed]: [],
  [S.Refunded]: [],
};

export const TERMINAL_STATES = new Set<S>([S.Completed, S.Refunded]);

export function canTransition(from: S | string, to: S | string): boolean {
  if (from === to) return false;
  return (TRANSITIONS[from as S] ?? []).includes(to as S);
}

export class InvalidTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Invalid transaction transition ${from} -> ${to}`);
  }
}

export function assertTransition(from: S | string, to: S | string) {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

/** Bridge virtual account event -> state it implies (null = no state change). */
export function stateForVirtualAccountEvent(type: string): S | null {
  switch (type) {
    case 'funds_scheduled':
    case 'funds_received':
      return S.Received;
    case 'payment_submitted':
      return S.Converting;
    case 'payment_processed':
      return S.Credited;
    case 'in_review':
      return S.InReview;
    case 'refunded':
      return S.Refunded;
    default:
      return null;
  }
}

/** Bridge transfer state -> payout state (null = no change, e.g. in_review). */
export function stateForTransfer(state: string): S | null {
  if (TRANSFER_TERMINAL_SUCCESS.has(state)) return S.Completed;
  if (state === 'payment_submitted') return S.PayoutSubmitted;
  if (state === 'awaiting_funds' || state === 'funds_received') return S.PayoutPending;
  if (TRANSFER_TERMINAL_FAILURE.has(state)) return S.PayoutFailed;
  return null;
}
