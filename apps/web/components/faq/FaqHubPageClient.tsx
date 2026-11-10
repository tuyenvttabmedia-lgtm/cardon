'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useT } from '@/components/i18n/LocaleProvider';
import { FaqAccordion, type FaqItem } from '@/components/faq/FaqAccordion';
import {
  fetchFaqsClient,
  listFaqCategoriesClient,
  type PublicFaqCategory,
  type PublicFaqItem,
} from '@/lib/cms-api';

const PAGE_SIZE = 20;

function mapItem(row: PublicFaqItem): FaqItem & { fallback?: boolean } {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    slug: row.slug,
    categorySlug: row.category.slug,
    fallback: row.fallback,
  };
}

export function FaqHubPageClient() {
  const t = useT();
  const { locale } = useLocale();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [categories, setCategories] = useState<PublicFaqCategory[]>([]);
  const [items, setItems] = useState<Array<FaqItem & { fallback?: boolean }>>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [categorySlug, setCategorySlug] = useState(searchParams.get('category') ?? '');
  const [position, setPosition] = useState(searchParams.get('position') ?? '');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const composingRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const syncedQueryRef = useRef((searchParams.get('q') ?? '').trim());

  // Shareable ?q= without remounting via Next router (avoids wiping in-progress search).
  useEffect(() => {
    if (composingRef.current) return;
    const trimmed = query.trim();
    if (trimmed === syncedQueryRef.current) return;

    const timer = setTimeout(() => {
      if (composingRef.current) return;
      syncedQueryRef.current = trimmed;
      const params = new URLSearchParams(window.location.search);
      if (trimmed) params.set('q', trimmed);
      else params.delete('q');
      const qs = params.toString();
      window.history.replaceState(window.history.state, '', qs ? `/tro-giup?${qs}` : '/tro-giup');
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    void listFaqCategoriesClient(locale).then((rows) => setCategories(rows ?? []));
  }, [locale]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchFaqsClient({
        q: query.trim() || undefined,
        category: categorySlug || undefined,
        position: position || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        locale,
      });
      setItems((result?.items ?? []).map(mapItem));
      setTotal(result?.total ?? 0);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [categorySlug, locale, page, position, query]);

  useEffect(() => {
    if (composingRef.current) return;
    const timer = setTimeout(() => void load(), query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  useEffect(() => {
    setPage(1);
  }, [categorySlug, query, position]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showFallbackNotice = locale === 'en' && items.some((item) => item.fallback);

  const sidebarCategories = useMemo(
    () => [{ id: 'all', name: t('common.all'), slug: '', sortOrder: -1 }, ...categories],
    [categories, t],
  );

  const selectCategory = (slug: string) => {
    setCategorySlug(slug);
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : searchParams.toString());
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
          {t('nav.home')}
        </Link>
        <span className="mx-2">›</span>
        <span className="text-cardon-navy">{t('faq.help')}</span>
      </nav>
      {showFallbackNotice ? (
        <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{t('common.untranslated')}</p>
      ) : null}

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-cardon-navy md:text-3xl">{t('faq.hubTitle')}</h1>
        <p className="mt-2 text-sm text-cardon-gray">{t('faq.hubBody')}</p>
        <input
          ref={searchInputRef}
          type="search"
          placeholder={t('faq.search')}
          className="mt-4 w-full rounded-xl border border-cardon-border px-4 py-3 text-sm outline-none focus:border-cardon-blue md:max-w-lg"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={(e) => {
            composingRef.current = false;
            setQuery(e.currentTarget.value);
          }}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <aside className="space-y-1">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-cardon-gray">
            {t('faq.categories')}
          </p>
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
            <p className="text-sm text-cardon-gray">{t('common.loading')}</p>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-cardon-border bg-white p-8 text-center">
              <p className="text-sm text-cardon-gray">{t('faq.empty')}</p>
              <Link href="/lien-he" className="mt-4 inline-block text-sm font-semibold text-cardon-blue hover:underline">
                {t('faq.contactSupport')}
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
                    {t('faq.prev')}
                  </button>
                  <span className="text-sm text-cardon-gray">
                    {t('faq.pageOf')} {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-lg border border-cardon-border px-3 py-1.5 text-sm disabled:opacity-40"
                  >
                    {t('faq.next')}
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
