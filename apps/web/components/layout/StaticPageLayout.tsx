'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { PageContainer } from '@/components/layout/PageContainer';
import { SafeCmsHtml } from '@/components/SafeCmsHtml';
import { staticPagePath } from '@/lib/routes';
import { STATIC_CMS_PAGES } from '@/lib/static-pages';
import { useLocale, useT } from '@/components/i18n/LocaleProvider';
import type { MessageKey } from '@/lib/i18n/messages';
import { cn } from '@/lib/utils';

export interface StaticPageNavItem {
  slug: string;
  label: string;
}

interface StaticPageLayoutProps {
  slug: string;
  title: string;
  content: string;
  navItems?: StaticPageNavItem[];
  breadcrumb?: Array<{ label: string; href?: string }>;
  contentFallback?: boolean;
}

const POLICY_KEYS: Record<string, MessageKey> = {
  'gioi-thieu': 'policy.about',
  'chinh-sach-bao-mat': 'policy.privacy',
  'dieu-khoan-su-dung': 'policy.terms',
  'chinh-sach-hoan-tien': 'policy.refund',
  'chinh-sach-thanh-toan': 'policy.payment',
  'lien-he': 'nav.contact',
};

export function StaticPageLayout({
  slug,
  title,
  content,
  navItems,
  breadcrumb,
  contentFallback = false,
}: StaticPageLayoutProps) {
  const pathname = usePathname();
  const { locale } = useLocale();
  const t = useT();
  const pages =
    navItems && navItems.length > 0
      ? navItems
      : STATIC_CMS_PAGES.map((p) => ({ slug: p.slug, label: p.label }));

  return (
    <PageContainer>
      <Breadcrumb
        items={breadcrumb ?? [
          { label: t('nav.home'), href: '/' },
          { label: title },
        ]}
        className="mb-6"
      />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr] lg:items-start">
        <nav className="rounded-2xl border border-cardon-border bg-white p-3 shadow-card lg:sticky lg:top-[88px]">
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-cardon-gray">
            {t('policy.nav')}
          </p>
          <ul className="space-y-1">
            {pages.map((page) => {
              const href = staticPagePath(page.slug);
              const active = pathname === href || slug === page.slug;
              return (
                <li key={page.slug}>
                  <Link
                    href={href}
                    className={cn(
                      'block rounded-xl px-3 py-2.5 text-sm font-medium transition',
                      active
                        ? 'bg-cardon-blue text-white'
                        : 'text-cardon-navy hover:bg-cardon-light',
                    )}
                  >
                    {POLICY_KEYS[page.slug] ? t(POLICY_KEYS[page.slug]) : page.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <article className="rounded-2xl border border-cardon-border bg-white p-5 shadow-card md:p-8">
          <h1 className="text-2xl font-bold text-cardon-navy md:text-3xl">{title}</h1>
          {locale === 'en' && contentFallback ? (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{t('common.untranslated')}</p>
          ) : null}
          <SafeCmsHtml html={content} className="cms-prose mt-6" />
        </article>
      </div>
    </PageContainer>
  );
}
