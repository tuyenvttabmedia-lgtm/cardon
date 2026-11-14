'use client';

import Link from 'next/link';
import { useT } from '@/components/i18n/LocaleProvider';
import { CustomerProductLogo } from '@/components/product/CustomerProductLogo';
import { useProducts } from '@/hooks/useProducts';
import { CARD_GAME_PATH, CARD_PHONE_PATH } from '@/lib/checkout-services';
import type { Product } from '@/types/api';

function productHref(product: Product): string {
  if (product.homeService === 'PHONE_CARD') return CARD_PHONE_PATH;
  if (product.homeService === 'TOPUP') return '/nap-cuoc';
  if (product.homeService === 'DATA') return '/nap-data';
  return CARD_GAME_PATH;
}

export function ArticleBuySuggestions() {
  const t = useT();
  const { products, loading } = useProducts();

  const game = products.filter((p) => p.homeService === 'GAME_CARD').slice(0, 4);
  const phone = products.filter((p) => p.homeService === 'PHONE_CARD').slice(0, 2);
  const suggestions = [...game, ...phone];

  return (
    <section className="rounded-xl border border-cardon-border bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold uppercase tracking-wide text-cardon-navy">{t('blog.buySuggest')}</h2>

      {loading ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse rounded-lg bg-cardon-light" />
          ))}
        </div>
      ) : suggestions.length > 0 ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {suggestions.map((product) => (
            <Link
              key={product.id}
              href={productHref(product)}
              aria-label={product.name}
              className="flex h-14 items-center justify-center rounded-lg border border-cardon-border bg-white px-1.5 transition-colors hover:border-cardon-blue/40 hover:shadow-sm"
            >
              <CustomerProductLogo name={product.name} slug={product.slug} logoUrl={product.logoUrl} />
            </Link>
          ))}
        </div>
      ) : null}

      <ul className="mt-3 space-y-1.5 border-t border-cardon-border pt-3 text-sm">
        <li>
          <Link href={CARD_GAME_PATH} className="font-semibold text-cardon-blue hover:underline">
            {t('nav.game')} →
          </Link>
        </li>
        <li>
          <Link href={CARD_PHONE_PATH} className="font-semibold text-cardon-blue hover:underline">
            {t('nav.phone')} →
          </Link>
        </li>
        <li>
          <Link href="/nap-cuoc" className="font-semibold text-cardon-blue hover:underline">
            {t('nav.topup')} →
          </Link>
        </li>
      </ul>
    </section>
  );
}
