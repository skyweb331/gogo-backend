import { Container } from 'typedi';

import { OnboardingService } from '#src/entity/onboarding/onboarding.service.js';
import { DepositService } from '#src/entity/transaction/deposit.service.js';
import { PayoutService } from '#src/entity/transaction/payout.service.js';
import type {
  BridgeTransfer,
  BridgeVirtualAccountEvent,
  BridgeWebhookEvent,
} from '#src/service/bridge/index.js';

import { WebhookDispatcher } from './dispatcher.js';

/** Bridge event categories and the modules that process them. */
export function registerWebhookHandlers() {
  const dispatcher = Container.get(WebhookDispatcher);
  const onboarding = Container.get(OnboardingService);
  const deposits = Container.get(DepositService);
  const payouts = Container.get(PayoutService);

  dispatcher.on('kyc_link', (event) => onboarding.handleKycLinkEvent(event));
  dispatcher.on('customer', (event) => onboarding.handleCustomerEvent(event));
  dispatcher.on('virtual_account.activity', (event) =>
    deposits.handleWebhook(event as BridgeWebhookEvent<BridgeVirtualAccountEvent>)
  );
  dispatcher.on('transfer', (event) =>
    payouts.handleWebhook(event as BridgeWebhookEvent<BridgeTransfer>)
  );
}
