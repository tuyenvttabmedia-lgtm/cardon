'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ServiceNavigation } from '@/components/checkout/ServiceNavigation';
import { HeroBanner, type HeroBannerVariant } from '@/components/home/HeroBanner';
import { useProducts } from '@/hooks/useProducts';
import { resolveHomeCategoryIcons, type HomeCategory } from '@/lib/home-catalog';
import { productApi } from '@/services/api-client';
import type { Category } from '@/types/api';

function resolveHeroVariant(pathname: string): HeroBannerVariant {
  if (pathname.startsWith('/nap-cuoc')) return 'topup';
  if (pathname.startsWith('/nap-data')) return 'data';
  return 'card';
}

function resolveActiveService(pathname: string, categoryParam: string | null): HomeCategory {
  if (pathname.startsWith('/nap-cuoc')) return 'topup';
  if (pathname.startsWith('/nap-data')) return 'data';
  return categoryParam === 'phone' ? 'phone' : 'game';
}

function CheckoutChromeInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { products, loading } = useProducts();
  const [catalogCategories, setCatalogCategories] = useState<Category[]>([]);

  useEffect(() => {
    void productApi.listCategories().then(setCatalogCategories).catch(() => undefined);
  }, []);

  const heroVariant = resolveHeroVariant(pathname);
  const activeService = useMemo(
    () => resolveActiveService(pathname, searchParams.get('category')),
    [pathname, searchParams],
  );

  const categoryIcons = useMemo(
    () => resolveHomeCategoryIcons(products, catalogCategories),
    [products, catalogCategories],
  );

  return (
    <div className="site-container space-y-6 py-6 md:py-8">
      <HeroBanner variant={heroVariant} />
      <ServiceNavigation
        activeService={activeService}
        categoryIcons={categoryIcons}
        products={products}
        loading={loading}
      />
      {children}
    </div>
  );
}

function CheckoutChromeFallback({ children }: { children: React.ReactNode }) {
  return (
    <div className="site-container space-y-6 py-6 md:py-8">
      <div className="relative min-h-[180px] animate-pulse rounded-2xl bg-gray-100 md:min-h-[340px] md:rounded-3xl" />
      {children}
    </div>
  );
}

export function CheckoutChrome({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<CheckoutChromeFallback>{children}</CheckoutChromeFallback>}>
      <CheckoutChromeInner>{children}</CheckoutChromeInner>
    </Suspense>
  );
}
