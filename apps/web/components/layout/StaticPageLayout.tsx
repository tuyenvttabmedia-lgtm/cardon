'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Breadcrumb } from '@/components/layout/Breadcrumb';
import { PageContainer } from '@/components/layout/PageContainer';
import { SafeCmsHtml } from '@/components/SafeCmsHtml';
import { staticPagePath } from '@/lib/routes';
import { STATIC_CMS_PAGES } from '@/lib/static-pages';
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
}

export function StaticPageLayout({ slug, title, content, navItems, breadcrumb }: StaticPageLayoutProps) {
  const pathname = usePathname();
  const pages =
    navItems && navItems.length > 0
      ? navItems
      : STATIC_CMS_PAGES.map((p) => ({ slug: p.slug, label: p.label }));

  return (
    <PageContainer>
      <Breadcrumb
        items={breadcrumb ?? [
          { label: 'Trang chủ', href: '/' },
          { label: title },
        ]}
        className="mb-6"
      />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr] lg:items-start">
        <nav className="rounded-2xl border border-cardon-border bg-white p-3 shadow-card lg:sticky lg:top-[88px]">
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-cardon-gray">
            Trang thông tin
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
                    {page.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <article className="rounded-2xl border border-cardon-border bg-white p-5 shadow-card md:p-8">
          <h1 className="text-2xl font-bold text-cardon-navy md:text-3xl">{title}</h1>
          <SafeCmsHtml html={content} className="cms-prose mt-6" />
        </article>
      </div>
    </PageContainer>
  );
}
