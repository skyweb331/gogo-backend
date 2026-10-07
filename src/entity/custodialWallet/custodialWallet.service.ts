import { Service } from 'typedi';

import { config } from '#src/config.js';
import { PrismaService, type CustodialWalletRow, type CustomerRow } from '#src/service/prisma.js';
import { BridgeService } from '#src/service/bridge/index.js';
import { Chain } from '#src/graphql/enum.js';
import { isSqlError } from '#src/utils/errors.js';

/** The Bridge-custodied wallet that holds funds between the virtual account and the payout. */
@Service()
export class CustodialWalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bridge: BridgeService
  ) {}

  async getById(id: number) {
    return this.prisma.orm.CustodialWallet.where({ id }).first();
  }

  async getForCustomer(customerId: number, chain: Chain = config.CUSTODIAL_CHAIN as Chain) {
    return this.prisma.orm.CustodialWallet.where({ customerId, chain }).first();
  }

  async listForCustomer(customerId: number): Promise<CustodialWalletRow[]> {
    return this.prisma.orm.CustodialWallet.where({ customerId })
      .orderBy((w) => w.id.asc())
      .all();
  }

  async ensure(
    customer: CustomerRow,
    chain: Chain = config.CUSTODIAL_CHAIN as Chain
  ): Promise<CustodialWalletRow> {
    const existing = await this.getForCustomer(customer.id, chain);
    if (existing) return existing;
    if (!customer.bridgeCustomerId)
      throw new Error(`Customer ${customer.id} has no Bridge customer`);

    const remote = await this.bridge.wallets.create(customer.bridgeCustomerId, chain);
    try {
      return await this.prisma.orm.CustodialWallet.create({
        customerId: customer.id,
        bridgeWalletId: remote.id,
        chain,
        address: remote.address,
      });
    } catch (error) {
      if (!isSqlError(error, '23505')) throw error;
      const winner = await this.getForCustomer(customer.id, chain);
      if (!winner) throw error;
      return winner;
    }
  }

  /** Decimal balance string of one stablecoin in the custodial wallet. */
  async balance(customer: CustomerRow, wallet: CustodialWalletRow, currency: 'usdc' | 'eurc') {
    if (!customer.bridgeCustomerId) return '0';
    return this.bridge.wallets.balance(customer.bridgeCustomerId, wallet.bridgeWalletId, currency);
  }
}
