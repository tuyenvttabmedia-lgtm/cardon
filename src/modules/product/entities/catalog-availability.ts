import { HomeServiceType } from '@prisma/client';

export function isCustomerDataCatalogEnabled(customerDataEnabled?: boolean): boolean {
  return customerDataEnabled === true;
}

/**
 * Customer, agent API, and partner portal catalogs.
 * ESIM stays hidden until a later phase. DATA still follows customerDataEnabled.
 * CARD, TOPUP, and PHONE_CARD are unchanged.
 */
export function isExcludedFromCustomerCatalog(
  homeService: HomeServiceType | null | undefined,
  customerDataEnabled?: boolean,
): boolean {
  if (homeService === HomeServiceType.ESIM) return true;
  if (
    homeService === HomeServiceType.DATA &&
    !isCustomerDataCatalogEnabled(customerDataEnabled)
  ) {
    return true;
  }
  return false;
}

export function filterPublicCatalogByHomeService<
  T extends { homeService?: HomeServiceType | null },
>(items: T[], customerDataEnabled?: boolean): T[] {
  return items.filter(
    (item) => !isExcludedFromCustomerCatalog(item.homeService, customerDataEnabled),
  );
}
