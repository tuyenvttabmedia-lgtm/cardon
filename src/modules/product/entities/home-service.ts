import { BadRequestException } from '@nestjs/common';
import { HomeServiceType, ProductVariantType } from '@prisma/client';

export { HomeServiceType };

export const HOME_SERVICE_TYPES = Object.values(HomeServiceType);

export const HOME_SERVICE_ROOT_NAMES: Record<HomeServiceType, string> = {
  [HomeServiceType.GAME_CARD]: 'Thẻ game',
  [HomeServiceType.PHONE_CARD]: 'Thẻ điện thoại',
  [HomeServiceType.TOPUP]: 'Nạp cước',
  [HomeServiceType.DATA]: 'Nạp Data',
};

/** @deprecated Phase 6O31 — classification uses Category.homeService column. Kept for seed/repair scripts. */
export const HOME_SERVICE_ROOT_SLUGS: Record<HomeServiceType, string> = {
  [HomeServiceType.GAME_CARD]: 'game-card',
  [HomeServiceType.PHONE_CARD]: 'phone-card',
  [HomeServiceType.TOPUP]: 'topup',
  [HomeServiceType.DATA]: 'data',
};

const ALLOWED_VARIANT_TYPES: Record<HomeServiceType, ProductVariantType[]> = {
  [HomeServiceType.GAME_CARD]: [ProductVariantType.CARD],
  [HomeServiceType.PHONE_CARD]: [ProductVariantType.CARD],
  [HomeServiceType.TOPUP]: [ProductVariantType.TOPUP],
  [HomeServiceType.DATA]: [ProductVariantType.DATA],
};

/** Legacy slug hints — migration/repair scripts only. */
const LEGACY_CATEGORY_SLUG_HINTS: Array<{ pattern: RegExp; service: HomeServiceType }> = [
  { pattern: /phone-card|the-.*thoai|dien-thoai|telco|^phone/, service: HomeServiceType.PHONE_CARD },
  {
    pattern: /game-card|game-cards|local-demo-cards|smoke-game-cards|game-cards-local/,
    service: HomeServiceType.GAME_CARD,
  },
  { pattern: /(^topup$|nap-cuoc|local-demo-topup)/, service: HomeServiceType.TOPUP },
  { pattern: /(^data$|nap-data)/, service: HomeServiceType.DATA },
];

export function inferHomeServiceFromCategorySlug(slug: string): HomeServiceType {
  const normalized = slug.toLowerCase();
  for (const hint of LEGACY_CATEGORY_SLUG_HINTS) {
    if (hint.pattern.test(normalized)) return hint.service;
  }
  return HomeServiceType.GAME_CARD;
}

export function allowedVariantTypesForHomeService(homeService: HomeServiceType): ProductVariantType[] {
  return ALLOWED_VARIANT_TYPES[homeService];
}

export function isVariantTypeAllowedForHomeService(
  homeService: HomeServiceType,
  variantType: ProductVariantType,
): boolean {
  return ALLOWED_VARIANT_TYPES[homeService].includes(variantType);
}

export function assertVariantAllowedForHomeService(
  homeService: HomeServiceType,
  variantType: ProductVariantType,
): void {
  if (!isVariantTypeAllowedForHomeService(homeService, variantType)) {
    throw new BadRequestException(
      `Variant type ${variantType} is not allowed for homepage service ${homeService}. ` +
        `Allowed: ${ALLOWED_VARIANT_TYPES[homeService].join(', ')}`,
    );
  }
}

export function assertCategoryHasHomeService(homeService: HomeServiceType | null | undefined): HomeServiceType {
  if (!homeService) {
    throw new BadRequestException('Category must have a homepage service (homeService).');
  }
  return homeService;
}

export function homeServiceDisplayLabel(homeService: HomeServiceType): string {
  return HOME_SERVICE_ROOT_NAMES[homeService];
}
