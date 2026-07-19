'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FaqAccordion, type FaqItem } from '@/components/faq/FaqAccordion';
import {
  fetchFaqsClient,
  listFaqCategoriesClient,
  type PublicFaqCategory,
  type PublicFaqItem,
} from '@/lib/cms-api';

const PAGE_SIZE = 20;

function mapItem(row: PublicFaqItem): FaqItem {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    slug: row.slug,
    categorySlug: row.category.slug,
  };
}

export function FaqHubPageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [categories, setCategories] = useState<PublicFaqCategory[]>([]);
  const [items, setItems] = useState<FaqItem[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [categorySlug, setCategorySlug] = useState(searchParams.get('category') ?? '');
  const [position, setPosition] = useState(searchParams.get('position') ?? '');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setQuery(searchParams.get('q') ?? '');
    setCategorySlug(searchParams.get('category') ?? '');
    setPosition(searchParams.get('position') ?? '');
  }, [searchParams]);

  useEffect(() => {
    const trimmed = query.trim();
    const current = searchParams.get('q') ?? '';
    if (trimmed === current) return;

    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (trimmed) params.set('q', trimmed);
      else params.delete('q');
      const qs = params.toString();
      router.replace(qs ? `/tro-giup?${qs}` : '/tro-giup', { scroll: false });
    }, 300);

    return () => clearTimeout(timer);
  }, [query, router, searchParams]);

  useEffect(() => {
    void listFaqCategoriesClient().then((rows) => setCategories(rows ?? []));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchFaqsClient({
        q: query.trim() || undefined,
        category: categorySlug || undefined,
        position: position || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      setItems((result?.items ?? []).map(mapItem));
      setTotal(result?.total ?? 0);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [categorySlug, page, position, query]);

  useEffect(() => {
    const t = setTimeout(() => void load(), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  useEffect(() => {
    setPage(1);
  }, [categorySlug, query, position]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const sidebarCategories = useMemo(
    () => [{ id: 'all', name: 'Tất cả', slug: '', sortOrder: -1 }, ...categories],
    [categories],
  );

  const selectCategory = (slug: string) => {
    setCategorySlug(slug);
    const params = new URLSearchParams(searchParams.toString());
    if (slug) params.set('category', slug);
    else params.delete('category');
    params.delete('page');
    const qs = params.toString();
    router.replace(qs ? `/tro-giup?${qs}` : '/tro-giup', { scroll: false });
  };

  return (
    <div className="page-shell py-8">
      <nav className="mb-4 text-sm text-cardon-gray">
        <Link href="/" className="hover:text-cardon-blue">
          Trang chủ
        </Link>
        <span className="mx-2">›</span>
        <span className="text-cardon-navy">Trợ giúp</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-cardon-navy md:text-3xl">Trung tâm trợ giúp</h1>
        <p className="mt-2 text-sm text-cardon-gray">
          Giải đáp thắc mắc về mua thẻ, nạp cước, data 4G/5G và thanh toán tại CardOn.vn
        </p>
        <input
          type="search"
          placeholder="Tìm câu hỏi..."
          className="mt-4 w-full rounded-xl border border-cardon-border px-4 py-3 text-sm outline-none focus:border-cardon-blue md:max-w-lg"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <aside className="space-y-1">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-cardon-gray">Danh mục</p>
          {sidebarCategories.map((cat) => {
            const active = cat.slug === categorySlug;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => selectCategory(cat.slug)}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-medium ${
                  active ? 'bg-cardon-blue text-white' : 'text-cardon-navy hover:bg-cardon-light'
                }`}
              >
                {cat.name}
              </button>
            );
          })}
        </aside>

        <div>
          {loading ? (
            <p className="text-sm text-cardon-gray">Đang tải...</p>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-cardon-border bg-white p-8 text-center">
              <p className="text-sm text-cardon-gray">Không tìm thấy câu hỏi phù hợp.</p>
              <Link href="/lien-he" className="mt-4 inline-block text-sm font-semibold text-cardon-blue hover:underline">
                Liên hệ hỗ trợ →
              </Link>
            </div>
          ) : (
            <>
              <FaqAccordion items={items} title="" linkToDetail />
              {totalPages > 1 && (
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-cardon-border px-3 py-1.5 text-sm disabled:opacity-40"
                  >
                    ← Trước
                  </button>
                  <span className="text-sm text-cardon-gray">
                    Trang {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-lg border border-cardon-border px-3 py-1.5 text-sm disabled:opacity-40"
                  >
                    Sau →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
