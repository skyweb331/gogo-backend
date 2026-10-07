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
registerEnumType(WalletKeyStatus, { name: 'WalletKeyStatus' });
registerEnumType(OnboardingStep, { name: 'OnboardingStep' });
