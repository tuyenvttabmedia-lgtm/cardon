'use client';

import { createContext, useContext, useMemo } from 'react';
import type { CmsBanner } from '@/lib/cms-api';
import type { Product } from '@/types/api';

type StorefrontSeed = {
  products: Product[];
  /** null when this tree did not receive a server banner payload. */
  heroBanners: CmsBanner[] | null;
};

const StorefrontDataContext = createContext<StorefrontSeed | null>(null);

export function StorefrontDataProvider({
  products,
  heroBanners,
  children,
}: {
  products: Product[];
  heroBanners: CmsBanner[];
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({ products, heroBanners }),
    [products, heroBanners],
  );
  return (
    <StorefrontDataContext.Provider value={value}>{children}</StorefrontDataContext.Provider>
  );
}

export function useStorefrontData(): StorefrontSeed | null {
  return useContext(StorefrontDataContext);
}
