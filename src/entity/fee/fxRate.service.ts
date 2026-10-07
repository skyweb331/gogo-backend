import { Service } from 'typedi';

import { BridgeService } from '#src/service/bridge/index.js';
import { FiatCurrency } from '#src/graphql/enum.js';
import { AppSettingService } from '#src/entity/appSetting/appSetting.service.js';
import { AppError } from '#src/utils/errors.js';
import { multiplyByDecimal } from '#src/utils/money.js';

const LAST_RATE_KEY = 'fx.eur_usd.last';

/** EUR -> USD conversion for fee volume. Tiers are denominated in USD. */
@Service()
export class FxRateService {
  constructor(
    private readonly bridge: BridgeService,
    private readonly settings: AppSettingService
  ) {}

  /** Bridge mid-market EUR->USD; falls back to the last stored rate when Bridge is unreachable. */
  async eurToUsd(): Promise<string> {
    if (this.bridge.configured) {
      try {
        const rate = await this.bridge.exchangeRates.get('eur', 'usd');
        if (rate.midmarket_rate) {
          await this.settings.set(LAST_RATE_KEY, {
            rate: rate.midmarket_rate,
            at: new Date().toISOString(),
          });
          return rate.midmarket_rate;
        }
      } catch (error) {
        console.warn(`[fx] Bridge exchange rate unavailable: ${(error as Error).message}`);
      }
    }
    const last = await this.settings.get<{ rate: string } | null>(LAST_RATE_KEY, null);
    if (last?.rate) return last.rate;
    throw new AppError('Exchange rates are temporarily unavailable', { code: 'FX_UNAVAILABLE' });
  }

  async toUsd(amountInCents: bigint, currency: FiatCurrency | string) {
    if (currency === FiatCurrency.usd)
      return { usdInCents: amountInCents, fxRate: null as string | null };
    const fxRate = await this.eurToUsd();
    return { usdInCents: multiplyByDecimal(amountInCents, fxRate), fxRate };
  }
}
