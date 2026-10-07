import { randomUUID } from 'node:crypto';
import { Service } from 'typedi';

import { isBridgeSandbox } from '#src/config.js';
import { PrismaService } from '#src/service/prisma.js';
import { BridgeService, type BridgeVirtualAccountEvent } from '#src/service/bridge/index.js';
import { CustomerStatus, FiatCurrency } from '#src/graphql/enum.js';
import { AuditLogService } from '#src/entity/auditLog/auditLog.service.js';
import { CustodialWalletService } from '#src/entity/custodialWallet/custodialWallet.service.js';
import {
  STABLECOIN_FOR,
  VirtualAccountService,
} from '#src/entity/virtualAccount/virtualAccount.service.js';
import type { Context } from '#src/context.js';
import { AppError, NotFoundError } from '#src/utils/errors.js';

import { DepositService } from './deposit.service.js';
import { TransactionService } from './transaction.service.js';
import type { SimulateDepositInput } from './transaction.type.js';

/**
 * Bridge sandbox sends no payment webhooks and returns dummy VA activity, so this
 * funds the custodial wallet for real and feeds synthetic VA events through the same
 * DepositService path a webhook would take.
 */
@Service()
export class SandboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bridge: BridgeService,
    private readonly virtualAccounts: VirtualAccountService,
    private readonly custodial: CustodialWalletService,
    private readonly deposits: DepositService,
    private readonly transactions: TransactionService,
    private readonly audit: AuditLogService
  ) {}

  async simulateDeposit(input: SimulateDepositInput, ctx: Context) {
    if (!isBridgeSandbox)
      throw new AppError('Simulated deposits are only available in the Bridge sandbox');
    const customer = await this.prisma.orm.Customer.where({ id: input.customerId }).first();
    if (!customer) throw new NotFoundError('Customer not found');
    if (customer.status !== CustomerStatus.Active || !customer.bridgeCustomerId) {
      throw new AppError('Customer has not finished onboarding');
    }
    const va = await this.virtualAccounts.activeFor(customer.id, input.currency);
    if (!va)
      throw new AppError(`Customer has no active ${input.currency.toUpperCase()} virtual account`, {
        field: 'currency',
      });
    const wallet = await this.custodial.getById(va.custodialWalletId);
    if (!wallet) throw new AppError('Custodial wallet missing');

    const depositId = `sandbox_${randomUUID()}`;
    const amount = Number(input.amount).toFixed(2);
    await this.bridge.wallets.simulateDeposit(
      customer.bridgeCustomerId,
      wallet.bridgeWalletId,
      amount,
      STABLECOIN_FOR[input.currency],
      `simulate-${depositId}`
    );

    const base = {
      customer_id: customer.bridgeCustomerId,
      virtual_account_id: va.bridgeVirtualAccountId,
      deposit_id: depositId,
      amount,
      currency: input.currency,
      source: {
        payment_rail: input.currency === FiatCurrency.eur ? 'sepa' : 'ach_push',
        sender_name: 'Sandbox Payer',
        description: 'Simulated deposit',
      },
    };
    const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
    const activities: BridgeVirtualAccountEvent[] = [
      { ...base, id: `${depositId}_funds_received`, type: 'funds_received', created_at: at(0) },
      {
        ...base,
        id: `${depositId}_payment_submitted`,
        type: 'payment_submitted',
        created_at: at(1),
      },
      {
        ...base,
        id: `${depositId}_payment_processed`,
        type: 'payment_processed',
        created_at: at(2),
        receipt: {
          initial_amount: amount,
          exchange_fee: '0.00',
          developer_fee: '0.00',
          final_amount: amount,
        },
      },
    ];
    for (const activity of activities) await this.deposits.handleActivity(activity);

    const tx = await this.transactions.getByDepositId(depositId);
    await this.audit.log(ctx, {
      action: 'sandbox.simulateDeposit',
      entity: 'Transaction',
      entityId: tx?.id,
      after: { customerId: customer.id, amount, currency: input.currency, depositId },
    });
    return tx;
  }
}
