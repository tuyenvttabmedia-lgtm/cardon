import { HomeServiceType } from '@prisma/client';

export function isCustomerDataCatalogEnabled(customerDataEnabled?: boolean): boolean {
  return customerDataEnabled === true;
}

export function filterPublicCatalogByHomeService<
  T extends { homeService?: HomeServiceType | null },
>(items: T[], customerDataEnabled?: boolean): T[] {
  if (isCustomerDataCatalogEnabled(customerDataEnabled)) {
    return items;
  }
  return items.filter((item) => item.homeService !== HomeServiceType.DATA);
}
