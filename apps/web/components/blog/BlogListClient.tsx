'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BlogCard } from '@/components/blog/BlogCard';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { PageContainer } from '@/components/layout/PageContainer';
import type { PublicBlogPost } from '@/lib/cms-api';
import { BLOG_BASE_PATH, blogCategoryPath } from '@/lib/routes';
import { matchesViSearch, stripHtmlForSearch } from '@/lib/vi-search';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 12;

export function BlogListClient({
  posts,
  pageTitle = 'Tin tức CardOn',
  pageSubtitle = 'Tin tức, khuyến mãi và hướng dẫn mua thẻ',
  breadcrumbLabel = 'Tin tức',
  lockedCategory,
  categoryIntro,
  postBasePath = BLOG_BASE_PATH,
  listBasePath = BLOG_BASE_PATH,
}: {
  posts: PublicBlogPost[];
  pageTitle?: string;
  pageSubtitle?: string;
  breadcrumbLabel?: string;
  lockedCategory?: string;
  categoryIntro?: string | null;
  postBasePath?: string;
  listBasePath?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const composingRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchEpoch, setSearchEpoch] = useState(0);

  useEffect(() => {
    // Avoid resetting the controlled input while the user is typing / composing VI IME.
    if (composingRef.current) return;
    if (document.activeElement === searchInputRef.current) return;
    setQuery(searchParams.get('q') ?? '');
  }, [searchParams]);

  useEffect(() => {
    if (composingRef.current) return;
    const trimmed = query.trim();
    const current = searchParams.get('q') ?? '';
    if (trimmed === current) return;

    const timer = setTimeout(() => {
      if (composingRef.current) return;
      const params = new URLSearchParams(searchParams.toString());
      if (trimmed) params.set('q', trimmed);
      else params.delete('q');
      params.delete('page');
      const qs = params.toString();
      router.replace(qs ? `${listBasePath}?${qs}` : listBasePath, { scroll: false });
    }, 300);

    return () => clearTimeout(timer);
  }, [query, listBasePath, router, searchParams, searchEpoch]);

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of posts) {
      if (p.categorySlug) map.set(p.categorySlug, p.category ?? p.categorySlug);
    }
    return Array.from(map.entries()).map(([slug, label]) => ({ slug, label }));
  }, [posts]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return posts;
    return posts.filter((p) =>
      matchesViSearch(
        q,
        p.title,
        p.excerpt,
        stripHtmlForSearch(p.content),
        p.category,
        p.categorySlug,
        p.slug,
        ...(Array.isArray(p.tags) ? p.tags : []),
      ),
    );
  }, [posts, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedPosts = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const featured = currentPage === 1 ? paginatedPosts[0] ?? null : null;
  const gridPosts = currentPage === 1 ? paginatedPosts.slice(1) : paginatedPosts;

  function goToPage(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (next <= 1) params.delete('page');
    else params.set('page', String(next));
    const qs = params.toString();
    router.push(qs ? `${listBasePath}?${qs}` : listBasePath);
  }

  const breadcrumbItems = lockedCategory
    ? [
        { label: 'Trang chủ', href: '/' },
        { label: 'Tin tức', href: BLOG_BASE_PATH },
        { label: breadcrumbLabel },
      ]
    : [{ label: 'Trang chủ', href: '/' }, { label: breadcrumbLabel }];

  return (
    <PageContainer>
      <Breadcrumb items={breadcrumbItems} className="mb-6" />

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-cardon-navy md:text-3xl">{pageTitle}</h1>
          <p className="mt-1 text-sm text-cardon-gray">{categoryIntro ?? pageSubtitle}</p>
        </div>
        <div className="relative w-full md:max-w-xs">
          <input
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={(e) => {
              composingRef.current = false;
              setQuery(e.currentTarget.value);
              setSearchEpoch((n) => n + 1);
            }}
            placeholder="Tìm bài viết..."
            className="w-full rounded-xl border border-cardon-border bg-white py-2.5 pl-4 pr-10 text-sm outline-none focus:border-cardon-blue"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-cardon-gray">🔍</span>
        </div>
      </div>

      {!lockedCategory && categories.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href={BLOG_BASE_PATH}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition',
              'bg-cardon-blue text-white',
            )}
          >
            Tất cả
          </Link>
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={blogCategoryPath(c.slug)}
              className="rounded-full border border-cardon-border bg-white px-4 py-1.5 text-sm font-medium text-cardon-navy transition hover:border-cardon-blue"
            >
              {c.label}
            </Link>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="mt-10 text-center text-cardon-gray">Chưa có bài viết phù hợp.</p>
      ) : (
        <div className="mt-8 space-y-8">
          {featured && <BlogCard post={featured} featured basePath={postBasePath} />}

          {gridPosts.length > 0 && (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {gridPosts.map((post) => (
                <BlogCard key={post.id} post={post} basePath={postBasePath} />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <nav className="flex items-center justify-center gap-2 pt-2" aria-label="Phân trang">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => goToPage(currentPage - 1)}
                className="rounded-lg border border-cardon-border px-3 py-2 text-sm disabled:opacity-40"
              >
                ← Trước
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => goToPage(n)}
                  className={cn(
                    'h-9 w-9 rounded-lg text-sm font-medium',
                    n === currentPage ? 'bg-cardon-blue text-white' : 'border border-cardon-border bg-white',
                  )}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => goToPage(currentPage + 1)}
                className="rounded-lg border border-cardon-border px-3 py-2 text-sm disabled:opacity-40"
              >
                Sau →
              </button>
            </nav>
          )}
        </div>
      )}
    </PageContainer>
  );
}
