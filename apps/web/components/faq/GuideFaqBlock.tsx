'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FaqAccordion, type FaqItem } from '@/components/faq/FaqAccordion';
import {
  fetchFaqsClient,
  listFaqCategoriesClient,
  type PublicFaqCategory,
  type PublicFaqItem,
} from '@/lib/cms-api';

function mapItem(row: PublicFaqItem): FaqItem {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    slug: row.slug,
    categorySlug: row.category.slug,
  };
}

export function GuideFaqBlock({ limit = 15 }: { limit?: number }) {
  const [categories, setCategories] = useState<PublicFaqCategory[]>([]);
  const [items, setItems] = useState<FaqItem[]>([]);
  const [query, setQuery] = useState('');
  const [categorySlug, setCategorySlug] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listFaqCategoriesClient().then((rows) => setCategories(rows ?? []));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchFaqsClient({
        position: 'guide',
        limit,
        q: query.trim() || undefined,
        category: categorySlug || undefined,
      });
      setItems((result?.items ?? []).map(mapItem));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [categorySlug, limit, query]);

  useEffect(() => {
    const t = setTimeout(() => void load(), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  const viewAllHref = useMemo(() => {
    const params = new URLSearchParams({ position: 'guide' });
    if (categorySlug) params.set('category', categorySlug);
    if (query.trim()) params.set('q', query.trim());
    return `/tro-giup?${params.toString()}`;
  }, [categorySlug, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold text-cardon-navy">Câu hỏi thường gặp về hướng dẫn</h2>
        <input
          type="search"
          placeholder="Tìm câu hỏi..."
          className="w-full rounded-xl border border-cardon-border px-3 py-2 text-sm outline-none focus:border-cardon-blue sm:max-w-xs"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategorySlug('')}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              !categorySlug ? 'bg-cardon-blue text-white' : 'bg-cardon-light text-cardon-navy'
            }`}
          >
            Tất cả
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategorySlug(cat.slug)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                categorySlug === cat.slug ? 'bg-cardon-blue text-white' : 'bg-cardon-light text-cardon-navy'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-cardon-gray">Đang tải...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-cardon-gray">Không tìm thấy câu hỏi phù hợp.</p>
      ) : (
        <FaqAccordion items={items} title="" linkToDetail />
      )}

      <div className="text-center">
        <Link href={viewAllHref} className="text-sm font-semibold text-cardon-blue hover:underline">
          Xem tất cả →
        </Link>
      </div>
    </div>
  );
}
