import type { NonEmptyArray } from 'type-graphql';

import { SystemResolver } from './entity/system/system.resolver.js';
import { UserResolver } from './entity/user/user.resolver.js';
import { CustomerResolver } from './entity/customer/customer.resolver.js';
import { FeeResolver } from './entity/fee/fee.resolver.js';
import { OnboardingResolver } from './entity/onboarding/onboarding.resolver.js';
import { VirtualAccountResolver } from './entity/virtualAccount/virtualAccount.resolver.js';
import { WalletResolver } from './entity/wallet/wallet.resolver.js';
import { WebhookEventResolver } from './entity/webhookEvent/webhookEvent.resolver.js';
import {
  TransactionEventResolver,
  TransactionResolver,
} from './entity/transaction/transaction.resolver.js';
import {
  SupportMessageResolver,
  SupportTicketResolver,
} from './entity/supportTicket/supportTicket.resolver.js';
import { AuditLogResolver } from './entity/auditLog/auditLog.resolver.js';
import { AdminResolver } from './entity/admin/admin.resolver.js';

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export const resolvers: NonEmptyArray<Function> = [
  SystemResolver,
  UserResolver,
  CustomerResolver,
  OnboardingResolver,
  FeeResolver,
  VirtualAccountResolver,
  WalletResolver,
  WebhookEventResolver,
  TransactionResolver,
  TransactionEventResolver,
  SupportTicketResolver,
  SupportMessageResolver,
  AuditLogResolver,
  AdminResolver,
];
