import { registerEnumType } from 'type-graphql';

import { contract } from '#src/service/prisma.js';

/**
 * TypeScript mirrors of the PSL enums in prisma/schema.prisma.
 * `assertEnumsMatchContract()` runs on boot so the two can't drift.
 */

export enum UserRole {
  Customer = 'Customer',
  Support = 'Support',
  Admin = 'Admin',
}

export enum CustomerType {
  individual = 'individual',
  business = 'business',
}

export enum CustomerStatus {
  Onboarding = 'Onboarding',
  Active = 'Active',
  Suspended = 'Suspended',
}

export enum Chain {
  base = 'base',
  solana = 'solana',
}

export enum WalletType {
  Generated = 'Generated',
  External = 'External',
}

export enum WalletStatus {
  Active = 'Active',
  Archived = 'Archived',
}

export enum FiatCurrency {
  usd = 'usd',
  eur = 'eur',
}

export enum TransactionState {
  Received = 'Received',
  Converting = 'Converting',
  Credited = 'Credited',
  PayoutPending = 'PayoutPending',
  PayoutSubmitted = 'PayoutSubmitted',
  Completed = 'Completed',
  InReview = 'InReview',
  Refunded = 'Refunded',
  PayoutFailed = 'PayoutFailed',
}

export enum TransactionEventSource {
  bridge_va = 'bridge_va',
  bridge_transfer = 'bridge_transfer',
  system = 'system',
  admin = 'admin',
}

export enum FeeScheduleStatus {
  Draft = 'Draft',
  Scheduled = 'Scheduled',
  Active = 'Active',
  Superseded = 'Superseded',
  Cancelled = 'Cancelled',
}

export enum WebhookEventStatus {
  Pending = 'Pending',
  Processed = 'Processed',
  Failed = 'Failed',
  Ignored = 'Ignored',
}

export enum TicketStatus {
  Open = 'Open',
  Pending = 'Pending',
  Resolved = 'Resolved',
  Closed = 'Closed',
}

export enum OtpPurpose {
  EmailVerify = 'EmailVerify',
  PasswordReset = 'PasswordReset',
  WalletKeyExport = 'WalletKeyExport',
  WalletChange = 'WalletChange',
}

/**
 * Bridge statuses stored as text columns. Writes go through the `normalize*` helpers
 * so a value Bridge adds later can't break GraphQL serialization.
 */

export enum KycStatus {
  not_started = 'not_started',
  incomplete = 'incomplete',
  awaiting_questionnaire = 'awaiting_questionnaire',
  awaiting_ubo = 'awaiting_ubo',
  under_review = 'under_review',
  approved = 'approved',
  rejected = 'rejected',
  paused = 'paused',
  offboarded = 'offboarded',
  deposits_restricted = 'deposits_restricted',
}

export enum TosStatus {
  pending = 'pending',
  approved = 'approved',
}

export enum VirtualAccountStatus {
  activated = 'activated',
  deactivated = 'deactivated',
}

const isMember = <T extends string>(e: Record<string, T>, value: unknown): value is T =>
  Object.values(e).includes(value as T);

/** Bridge's customer object says `active` where KYC links say `approved`. Unknown values wait for review. */
export const normalizeKycStatus = (status?: string | null): KycStatus => {
  if (!status) return KycStatus.not_started;
  if (status === 'active') return KycStatus.approved;
  return isMember(KycStatus, status) ? status : KycStatus.under_review;
};

export const normalizeTosStatus = (status?: string | null): TosStatus =>
  status === TosStatus.approved ? TosStatus.approved : TosStatus.pending;

export const normalizeVirtualAccountStatus = (status?: string | null): VirtualAccountStatus =>
  status === VirtualAccountStatus.deactivated
    ? VirtualAccountStatus.deactivated
    : VirtualAccountStatus.activated;

/** GraphQL-only enums (not stored) */

export enum WalletKeyStatus {
  Stored = 'Stored',
  Exported = 'Exported',
  Removed = 'Removed',
  None = 'None',
}

export enum OnboardingStep {
  ChooseType = 'ChooseType',
  AcceptTos = 'AcceptTos',
  CompleteKyc = 'CompleteKyc',
  UnderReview = 'UnderReview',
  Rejected = 'Rejected',
  Finalize = 'Finalize',
  Done = 'Done',
}

const contractEnums: Record<string, Record<string, string>> = {
  user_role: UserRole,
  customer_type: CustomerType,
  customer_status: CustomerStatus,
  chain: Chain,
  wallet_type: WalletType,
  wallet_status: WalletStatus,
  fiat_currency: FiatCurrency,
  transaction_state: TransactionState,
  transaction_event_source: TransactionEventSource,
  fee_schedule_status: FeeScheduleStatus,
  webhook_event_status: WebhookEventStatus,
  ticket_status: TicketStatus,
  otp_purpose: OtpPurpose,
};

export function assertEnumsMatchContract() {
  const valueSets = (contract as any).storage.namespaces.public.entries.valueSet as Record<
    string,
    { values: string[] }
  >;
  const problems: string[] = [];
  for (const [name, tsEnum] of Object.entries(contractEnums)) {
    const members = valueSets[name]?.values.slice().sort();
    const values = Object.values(tsEnum).sort();
    if (!members) {
      problems.push(`${name}: missing in contract`);
    } else if (members.join(',') !== values.join(',')) {
      problems.push(`${name}: contract [${members}] vs graphql/enum.ts [${values}]`);
    }
  }
  if (problems.length) {
    throw new Error(
      `Enum drift between prisma/schema.prisma and graphql/enum.ts:\n${problems.join('\n')}`
    );
  }
}

registerEnumType(UserRole, { name: 'UserRole' });
registerEnumType(CustomerType, { name: 'CustomerType' });
registerEnumType(CustomerStatus, { name: 'CustomerStatus' });
registerEnumType(Chain, { name: 'Chain' });
registerEnumType(WalletType, { name: 'WalletType' });
registerEnumType(WalletStatus, { name: 'WalletStatus' });
registerEnumType(FiatCurrency, { name: 'FiatCurrency' });
registerEnumType(TransactionState, { name: 'TransactionState' });
registerEnumType(TransactionEventSource, { name: 'TransactionEventSource' });
registerEnumType(FeeScheduleStatus, { name: 'FeeScheduleStatus' });
registerEnumType(WebhookEventStatus, { name: 'WebhookEventStatus' });
registerEnumType(TicketStatus, { name: 'TicketStatus' });
registerEnumType(OtpPurpose, { name: 'OtpPurpose' });
registerEnumType(KycStatus, { name: 'KycStatus' });
registerEnumType(TosStatus, { name: 'TosStatus' });
registerEnumType(VirtualAccountStatus, { name: 'VirtualAccountStatus' });
registerEnumType(WalletKeyStatus, { name: 'WalletKeyStatus' });
registerEnumType(OnboardingStep, { name: 'OnboardingStep' });
