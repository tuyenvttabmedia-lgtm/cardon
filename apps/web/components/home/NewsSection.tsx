'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { BlogCard } from '@/components/blog/BlogCard';
import { useLocale, useT } from '@/components/i18n/LocaleProvider';
import type { PublicBlogPost } from '@/lib/cms-api';
import { BLOG_BASE_PATH } from '@/lib/routes';

export function NewsSection({ posts, icon }: { posts: PublicBlogPost[]; icon?: ReactNode }) {
  const t = useT();
  const { locale } = useLocale();
  const desktopItems = posts.slice(0, 8);

  if (!desktopItems.length) {
    return (
      <section>
        <h2 className="text-xl font-bold text-cardon-navy md:text-[1.75rem]">{t('news.title')}</h2>
        <p className="mt-3 rounded-2xl border border-dashed border-cardon-border bg-white p-4 text-sm text-cardon-gray">
          {t('news.empty')}
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-x-hidden">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-xl font-bold text-cardon-navy md:text-2xl">
          {icon ? <span className="inline-flex shrink-0 text-cardon-blue">{icon}</span> : null}
          {t('news.title')}
        </h2>
        <Link href={BLOG_BASE_PATH} className="shrink-0 text-sm font-semibold text-cardon-blue hover:underline">
          {t('common.viewAll')} →
        </Link>
      </div>
      {locale === 'en' && posts.some((post) => post.fallback !== false) ? (
        <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{t('common.untranslated')}</p>
      ) : null}

      {/* Mobile: compact rows (small thumb). md+: keep home grid cards. */}
      <div className="flex flex-col gap-2.5 md:hidden">
        {desktopItems.slice(0, 4).map((post) => (
          <BlogCard
            key={post.id}
            post={post}
            variant="compact"
            compactContext="home"
            basePath={BLOG_BASE_PATH}
          />
        ))}
      </div>
      <div className="hidden gap-4 md:grid md:grid-cols-2 lg:grid-cols-4">
        {desktopItems.map((post) => (
          <BlogCard key={post.id} post={post} variant="homeGrid" basePath={BLOG_BASE_PATH} />
        ))}
      </div>
    </section>
  );
}
