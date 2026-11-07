import { HomeServiceType } from '@prisma/client';

export type RetailMarket = 'VN' | 'INTL';

export const VN_ONLY_MARKET_NOTICE = 'Sản phẩm này chỉ bán tại Việt Nam.';

const VN_ONLY_HOME_SERVICES = new Set<string>([
  HomeServiceType.GAME_CARD,
  HomeServiceType.PHONE_CARD,
  HomeServiceType.TOPUP,
  HomeServiceType.DATA,
]);

/**
 * Visitor country comes from the edge header only.
 * Missing or unknown (XX) stays VN so the current Vietnam storefront is unchanged.
 * A country/market field on the request body is never an input here.
 */
export function resolveRetailMarket(countryCode: string | null | undefined): RetailMarket {
  const code = countryCode?.trim().toUpperCase() ?? '';
  if (!code || code === 'VN' || code === 'XX') return 'VN';
  return 'INTL';
}

export function isVnOnlyHomeService(homeService: string | null | undefined): boolean {
  return Boolean(homeService && VN_ONLY_HOME_SERVICES.has(homeService));
}

export function retailMarketAllowsHomeService(
  market: RetailMarket,
  homeService: string | null | undefined,
  variantType?: string | null,
): boolean {
  const service =
    homeService ??
    (variantType === 'TOPUP'
      ? HomeServiceType.TOPUP
      : variantType === 'DATA'
        ? HomeServiceType.DATA
        : variantType === 'CARD'
          ? HomeServiceType.GAME_CARD
          : null);
  if (!isVnOnlyHomeService(service)) return true;
  return market === 'VN';
}

export function annotateRetailMarket<T extends { homeService?: string | null }>(
  product: T,
  market: RetailMarket,
): T & { retailMarket: RetailMarket; marketSupported: boolean; marketNotice: string | null } {
  const marketSupported = retailMarketAllowsHomeService(market, product.homeService);
  return {
    ...product,
    retailMarket: market,
    marketSupported,
    marketNotice: marketSupported ? null : VN_ONLY_MARKET_NOTICE,
  };
}
