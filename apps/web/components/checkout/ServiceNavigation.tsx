'use client';

import Link from 'next/link';
import {
  CHECKOUT_SERVICE_REGISTRY,
  checkoutServiceById,
  homeCardServiceHref,
} from '@/lib/checkout-services';
import {
  getVisibleHomeServiceTabs,
  HOME_CATEGORY_TABS,
  type HomeCardCategory,
  type HomeCategory,
} from '@/lib/home-catalog';
import {
  isDataServiceVisible,
  isTopupServiceVisible,
  useSiteConfig,
} from '@/hooks/useSiteConfig';
import type { PublicSiteConfig } from '@/lib/cms-api';
import type { Product } from '@/types/api';
import { cn } from '@/lib/utils';

function ServiceTabContent({
  title,
  description,
  fallbackEmoji,
  iconUrl,
  active,
}: {
  title: string;
  description: string;
  fallbackEmoji: string;
  iconUrl: string | null;
  active: boolean;
}) {
  return (
    <>
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center sm:h-6 sm:w-6',
          active && 'sm:scale-110',
        )}
      >
        {iconUrl ? (
          <img src={iconUrl} alt="" className="max-h-8 max-w-8 object-contain sm:max-h-6 sm:max-w-6" />
        ) : (
          <span className="text-lg leading-none sm:text-base" aria-hidden>
            {fallbackEmoji}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1 text-left sm:flex-none sm:text-center">
        <span
          className={cn(
            'block text-sm font-bold uppercase leading-tight tracking-wide',
            active ? 'text-white' : 'text-cardon-navy',
          )}
        >
          {title}
        </span>
        {description ? (
          <span
            className={cn(
              'mt-0.5 block text-[11px] leading-snug',
              active ? 'text-white/85' : 'text-cardon-gray',
            )}
          >
            {description}
          </span>
        ) : null}
      </span>
    </>
  );
}

const itemBaseClass =
  'flex w-full min-h-[52px] items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all duration-200 sm:min-h-[48px] sm:items-center sm:justify-center sm:gap-1 sm:rounded-full sm:px-4 sm:py-2.5 sm:text-center';

const itemActiveClass =
  'bg-gradient-to-r from-cardon-blue to-blue-600 text-white shadow-md shadow-blue-200/60 sm:scale-[1.02]';

const itemIdleClass =
  'border border-gray-100 bg-white text-cardon-navy hover:border-cardon-blue/30 hover:bg-blue-50 sm:border-0';

const MOBILE_GRID_COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-2',
  4: 'grid-cols-2',
};

const DESKTOP_GRID_COLS: Record<number, string> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
};

function filterServiceTabIds(ids: HomeCategory[], siteConfig: PublicSiteConfig | null) {
  return ids.filter((id) => {
    if (id === 'data') return isDataServiceVisible(siteConfig);
    if (id === 'topup') return isTopupServiceVisible(siteConfig);
    return true;
  });
}

export function ServiceNavigation({
  activeService,
  categoryIcons,
  products,
  loading,
}: {
  activeService: HomeCategory;
  categoryIcons: Record<HomeCategory, string | null>;
  products: Product[];
  loading?: boolean;
}) {
  const siteConfig = useSiteConfig();

  const visibleIds = loading
    ? filterServiceTabIds(
        CHECKOUT_SERVICE_REGISTRY.map((s) => s.id),
        siteConfig,
      )
    : filterServiceTabIds(
        getVisibleHomeServiceTabs(products).map((t) => t.id),
        siteConfig,
      );

  if (!loading && visibleIds.length === 0) return null;

  const tabCount = Math.max(visibleIds.length, 1);
  const mobileCols = MOBILE_GRID_COLS[Math.min(tabCount, 4)] ?? 'grid-cols-2';
  const desktopCols = DESKTOP_GRID_COLS[Math.min(tabCount, 4)] ?? 'sm:grid-cols-4';

  return (
    <section id="mua-the" className="flex scroll-mt-24 justify-center px-2">
      <div
        className={cn(
          'w-full max-w-3xl rounded-2xl border border-gray-200 bg-white p-2 shadow-sm',
          'grid gap-2',
          mobileCols,
          'sm:inline-grid sm:w-fit sm:max-w-none sm:rounded-full sm:p-1.5',
          desktopCols,
        )}
      >
        {visibleIds.map((id) => {
          const catalogTab = HOME_CATEGORY_TABS.find((t) => t.id === id);
          const serviceDef = checkoutServiceById(id);
          if (!catalogTab) return null;

          const iconUrl = categoryIcons[id] ?? null;
          const active = activeService === id;
          const className = cn(itemBaseClass, active ? itemActiveClass : itemIdleClass);
          const isInlineCard = id === 'game' || id === 'phone';
          const tabProps = {
            title: catalogTab.title,
            description: catalogTab.description,
            fallbackEmoji: catalogTab.fallbackEmoji,
            iconUrl,
            active,
          };

          const href = isInlineCard
            ? homeCardServiceHref(id as HomeCardCategory)
            : serviceDef?.href;
          if (!href) return null;

          return (
            <Link
              key={id}
              href={href}
              scroll={isInlineCard ? false : undefined}
              prefetch={serviceDef?.prefetch ?? false}
              className={className}
              aria-current={active ? 'page' : undefined}
            >
              <ServiceTabContent {...tabProps} />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
