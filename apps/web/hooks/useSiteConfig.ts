'use client';

import { useEffect, useState } from 'react';
import { getSiteConfig, type PublicSiteConfig } from '@/lib/cms-api';

export function useSiteConfig() {
  const [config, setConfig] = useState<PublicSiteConfig | null>(null);

  useEffect(() => {
    void getSiteConfig().then(setConfig).catch(() => undefined);
  }, []);

  return config;
}

export function isDataServiceVisible(config: PublicSiteConfig | null | undefined): boolean {
  return config?.data?.ready === true;
}

export function isTopupServiceVisible(config: PublicSiteConfig | null | undefined): boolean {
  return config?.topup?.ready === true;
}

export function filterHeaderMenuBySiteConfig<
  T extends { href: string },
>(items: T[], config: PublicSiteConfig | null | undefined): T[] {
  return items.filter((item) => {
    if (item.href === '/nap-data' || item.href.startsWith('/nap-data/')) {
      return isDataServiceVisible(config);
    }
    if (item.href === '/nap-cuoc' || item.href.startsWith('/nap-cuoc/')) {
      return isTopupServiceVisible(config);
    }
    return true;
  });
}

export function filterMobileNavBySiteConfig<
  T extends { url: string },
>(items: T[], config: PublicSiteConfig | null | undefined): T[] {
  return items.filter((item) => {
    if (item.url === '/nap-data' || item.url.startsWith('/nap-data/')) {
      return isDataServiceVisible(config);
    }
    if (item.url === '/nap-cuoc' || item.url.startsWith('/nap-cuoc/')) {
      return isTopupServiceVisible(config);
    }
    return true;
  });
}
