'use client';

import Link from 'next/link';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHero } from '@/components/layout/PageHero';
import { StaticPageLayout } from '@/components/layout/StaticPageLayout';
import { SafeCmsHtml } from '@/components/SafeCmsHtml';
import { useLocale, useT } from '@/components/i18n/LocaleProvider';
import type { CmsPageLayoutValue } from '@/lib/cms-page-layout';
import type { StaticPageNavItem } from '@/components/layout/StaticPageLayout';

interface CmsPageViewProps {
  slug: string;
  title: string;
  content: string;
  excerpt?: string | null;
  pageLayout: CmsPageLayoutValue;
  navItems?: StaticPageNavItem[];
  contentFallback?: boolean;
}

export function CmsPageView({
  slug,
  title,
  content,
  excerpt,
  pageLayout,
  navItems,
  contentFallback = false,
}: CmsPageViewProps) {
  const t = useT();
  const { locale } = useLocale();
  const notice =
    locale === 'en' && contentFallback ? (
      <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{t('common.untranslated')}</p>
    ) : null;
  if (pageLayout === 'POLICY') {
    return (
      <StaticPageLayout
        slug={slug}
        title={title}
        content={content}
        navItems={navItems}
        contentFallback={contentFallback}
        breadcrumb={[
          { label: t('nav.home'), href: '/' },
          { label: title },
        ]}
      />
    );
  }

  if (pageLayout === 'LANDING') {
    return (
      <PageContainer>
        <PageHero
          title={title}
          subtitle={
            excerpt?.trim() || t('home.heroBody')
          }
        />
        {notice}
        <SafeCmsHtml html={content} className="cms-prose cms-landing mt-8" />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <article className="rounded-2xl border border-cardon-border bg-white p-5 shadow-card md:p-8">
        {notice}
        <h1 className="text-2xl font-bold text-cardon-navy md:text-3xl">{title}</h1>
        {excerpt ? <p className="mt-3 text-sm text-cardon-gray md:text-base">{excerpt}</p> : null}
        <SafeCmsHtml html={content} className="cms-prose mt-6" />
        {slug === 'gioi-thieu' ? (
          <div className="cms-block-cta mt-8">
            <Link href="/" className="cms-block-btn cms-block-btn-primary">
              Mua thẻ ngay
            </Link>
            <Link href="/lien-he" className="cms-block-btn cms-block-btn-secondary">
              Liên hệ chúng tôi
            </Link>
          </div>
        ) : null}
      </article>
    </PageContainer>
  );
}
