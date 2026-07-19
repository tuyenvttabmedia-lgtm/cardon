'use client';

import Link from 'next/link';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHero } from '@/components/layout/PageHero';
import { StaticPageLayout } from '@/components/layout/StaticPageLayout';
import { SafeCmsHtml } from '@/components/SafeCmsHtml';
import type { CmsPageLayoutValue } from '@/lib/cms-page-layout';
import type { StaticPageNavItem } from '@/components/layout/StaticPageLayout';

interface CmsPageViewProps {
  slug: string;
  title: string;
  content: string;
  excerpt?: string | null;
  pageLayout: CmsPageLayoutValue;
  navItems?: StaticPageNavItem[];
}

export function CmsPageView({
  slug,
  title,
  content,
  excerpt,
  pageLayout,
  navItems,
}: CmsPageViewProps) {
  if (pageLayout === 'POLICY') {
    return (
      <StaticPageLayout
        slug={slug}
        title={title}
        content={content}
        navItems={navItems}
        breadcrumb={[
          { label: 'Trang chủ', href: '/' },
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
            excerpt?.trim() ||
            'Nền tảng mua thẻ game, thẻ điện thoại và nạp cước trực tuyến uy tín tại Việt Nam.'
          }
        />
        <SafeCmsHtml html={content} className="cms-prose cms-landing mt-8" />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <article className="rounded-2xl border border-cardon-border bg-white p-5 shadow-card md:p-8">
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
