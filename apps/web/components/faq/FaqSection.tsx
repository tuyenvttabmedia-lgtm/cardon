'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useLocale, useT } from '@/components/i18n/LocaleProvider';
import { FaqAccordion, type FaqItem } from '@/components/faq/FaqAccordion';
import { fetchFaqsClient, type PublicFaqItem } from '@/lib/cms-api';

function mapItem(row: PublicFaqItem): FaqItem {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    slug: row.slug,
    categorySlug: row.category.slug,
  };
}

export function FaqSection({
  featured,
  position,
  limit = 10,
  title = 'Câu hỏi thường gặp',
  showViewAll = false,
  viewAllHref = '/tro-giup',
  viewAllPlacement = 'below',
  layout = 'stack',
  emptyText,
  className,
  initialItems,
  icon,
}: {
  featured?: boolean;
  position?: string;
  limit?: number;
  title?: string;
  showViewAll?: boolean;
  viewAllHref?: string;
  viewAllPlacement?: 'below' | 'header';
  layout?: 'stack' | 'split';
  emptyText?: string;
  className?: string;
  /** Server payload. Omit to fetch in the browser. */
  initialItems?: PublicFaqItem[];
  icon?: ReactNode;
}) {
  const t = useT();
  const { locale } = useLocale();
  const heading = title === 'Câu hỏi thường gặp' ? t('home.faqTitle') : title;
  const [items, setItems] = useState<FaqItem[]>(() => (initialItems ?? []).map(mapItem).slice(0, limit));
  const [loaded, setLoaded] = useState(initialItems != null);

  useEffect(() => {
    let cancelled = false;
    const initialLocale = initialItems?.[0]?.locale;
    // SSR payload already matches active locale — keep it, avoid a flash refetch.
    if (initialItems != null && (initialLocale === locale || (!initialLocale && locale === 'vi'))) {
      setItems(initialItems.map(mapItem).slice(0, limit));
      setLoaded(true);
      return;
    }

    void fetchFaqsClient({ featured, position, limit, locale })
      .then((result) => {
        if (cancelled) return;
        setItems((result?.items ?? []).map(mapItem));
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [featured, position, limit, initialItems, locale]);

  if (!loaded) return null;
  if (items.length === 0) {
    if (!emptyText) return null;
    return (
      <section className={className}>
        <h2 className="text-xl font-bold text-cardon-navy">{heading}</h2>
        <p className="mt-3 rounded-2xl border border-dashed border-cardon-border bg-white p-4 text-sm text-cardon-gray">
          {emptyText}
        </p>
      </section>
    );
  }

  const viewAll = showViewAll ? (
    <Link href={viewAllHref} className="shrink-0 text-sm font-semibold text-cardon-blue hover:underline">
      {t('home.faqAll')} →
    </Link>
  ) : null;

  return (
    <div className={className}>
      {viewAllPlacement === 'header' ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2.5 text-xl font-bold text-cardon-navy md:text-2xl">
            {icon ? <span className="inline-flex shrink-0 text-cardon-blue">{icon}</span> : null}
            {heading}
          </h2>
          {viewAll}
        </div>
      ) : null}
      <FaqAccordion items={items} title={viewAllPlacement === 'header' ? '' : heading} layout={layout} />
      {viewAllPlacement === 'below' && viewAll ? <div className="mt-4 text-center">{viewAll}</div> : null}
    </div>
  );
}
