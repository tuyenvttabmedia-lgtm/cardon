'use client';

import { useEffect, useState } from 'react';
import { productApi } from '@/services/api-client';

export type RetailMarket = 'VN' | 'INTL';

/** Browser call so the edge country is the visitor, not the cached storefront HTML. */
export function useRetailMarket(): RetailMarket {
  const [market, setMarket] = useState<RetailMarket>('VN');

  useEffect(() => {
    let cancelled = false;
    void productApi
      .retailMarket()
      .then((result) => {
        if (!cancelled && result.market === 'INTL') setMarket('INTL');
      })
      .catch(() => {
        /* Keep VN. Order creation still enforces the country header. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return market;
}
