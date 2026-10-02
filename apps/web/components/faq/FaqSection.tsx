'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
  className,
  initialItems,
}: {
  featured?: boolean;
  position?: string;
  limit?: number;
  title?: string;
  showViewAll?: boolean;
  viewAllHref?: string;
  className?: string;
  /** Server payload. Omit to fetch in the browser. */
  initialItems?: PublicFaqItem[];
}) {
  const [items, setItems] = useState<FaqItem[]>(() => (initialItems ?? []).map(mapItem));
  const [loaded, setLoaded] = useState(initialItems != null);

  useEffect(() => {
    if (initialItems != null) return;
    void fetchFaqsClient({ featured, position, limit })
      .then((result) => setItems((result?.items ?? []).map(mapItem)))
      .catch(() => setItems([]))
      .finally(() => setLoaded(true));
  }, [featured, position, limit, initialItems]);

  if (!loaded || items.length === 0) return null;

  return (
    <div className={className}>
      <FaqAccordion items={items} title={title} />
      {showViewAll && (
        <div className="mt-4 text-center">
          <Link
            href={viewAllHref}
            className="text-sm font-semibold text-cardon-blue hover:underline"
          >
            Xem tất cả câu hỏi →
          </Link>
        </div>
      )}
    </div>
  );
}
