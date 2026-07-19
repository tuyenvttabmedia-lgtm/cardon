'use client';

import { MarketingNav } from '@/components/marketing/MarketingNav';
import { RequirePermission } from '@/components/layout/AdminShell';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { cmsAdminApi, faqAdminApi } from '@/services/api-client';
import type { CmsCategory, CmsPage, CmsTag } from '@/types/api';
import { buildSeoChecklist, computeSeoScore, emptyCmsForm } from '@/lib/cms-editor-utils';
import { isInTrash, listDeletedForeverIds } from '@/lib/cms-revisions';

function StatCard({ label, value, href }: { label: string; value: number; href?: string }) {
  const inner = (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-admin-300">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-zinc-900">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default function MarketingDashboardPage() {
  const [articles, setArticles] = useState<CmsPage[]>([]);
  const [pages, setPages] = useState<CmsPage[]>([]);
  const [categories, setCategories] = useState<CmsCategory[]>([]);
  const [tags, setTags] = useState<CmsTag[]>([]);
  const [mediaCount, setMediaCount] = useState(0);
  const [faqCount, setFaqCount] = useState(0);
  const [bannerCount, setBannerCount] = useState(0);

  useEffect(() => {
    void cmsAdminApi.listPages({ type: 'BLOG_POST' }).then(setArticles).catch(() => undefined);
    void cmsAdminApi.listPages({ type: 'PAGE' }).then(setPages).catch(() => undefined);
    void cmsAdminApi.listCategories().then(setCategories).catch(() => undefined);
    void cmsAdminApi.listTags().then(setTags).catch(() => undefined);
    void cmsAdminApi.listMedia().then((m) => setMediaCount(m.length)).catch(() => undefined);
    void cmsAdminApi.listBanners().then((b) => setBannerCount(b.length)).catch(() => undefined);
    void faqAdminApi.list({ limit: 1 }).then((r) => setFaqCount(r.total)).catch(() => undefined);
  }, []);

  const stats = useMemo(() => {
    const deleted = listDeletedForeverIds();
    const active = articles.filter((a) => !isInTrash(a.id) && !deleted.has(a.id) && a.status !== 'ARCHIVED');
    const drafts = active.filter((a) => a.status === 'DRAFT');
    const published = active.filter((a) => a.status === 'PUBLISHED');
    let seoLow = 0;
    let noImage = 0;
    let noMeta = 0;
    let stale = 0;
    const thirtyDaysAgo = Date.now() - 30 * 86400000;

    for (const a of active) {
      const form = {
        ...emptyCmsForm(),
        title: a.title,
        slug: a.slug,
        content: a.content,
        featuredImage: a.featuredImage ?? '',
        focusKeyword: a.seo?.focusKeyword ?? '',
        metaDescription: a.seo?.metaDescription ?? '',
        canonicalUrl: a.seo?.canonicalUrl ?? '',
      };
      if (computeSeoScore(buildSeoChecklist(form)) < 80) seoLow++;
      if (!a.featuredImage) noImage++;
      if (!a.seo?.metaDescription?.trim()) noMeta++;
      if (new Date(a.updatedAt).getTime() < thirtyDaysAgo && a.status === 'PUBLISHED') stale++;
    }

    return { total: active.length, drafts: drafts.length, published: published.length, seoLow, noImage, noMeta, stale };
  }, [articles]);

  return (
    <RequirePermission permission="cms.manage">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Marketing Dashboard</h1>
        <MarketingNav />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Tổng bài viết" value={stats.total} href="/marketing/articles" />
          <StatCard label="Draft" value={stats.drafts} href="/marketing/articles" />
          <StatCard label="Published" value={stats.published} href="/marketing/articles" />
          <StatCard label="Trang tĩnh" value={pages.filter((p) => p.status !== 'ARCHIVED').length} href="/marketing/pages" />
          <StatCard label="Categories" value={categories.length} href="/marketing/categories" />
          <StatCard label="Tags" value={tags.length} href="/marketing/tags" />
          <StatCard label="Media" value={mediaCount} href="/marketing/media" />
          <StatCard label="FAQ" value={faqCount} href="/marketing/faq" />
          <StatCard label="Banner" value={bannerCount} href="/marketing/banners" />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <h2 className="font-semibold text-amber-900">Cần chú ý</h2>
            <ul className="mt-3 space-y-2 text-sm text-amber-800">
              <li>SEO dưới 80: <strong>{stats.seoLow}</strong> bài</li>
              <li>Chưa có ảnh đại diện: <strong>{stats.noImage}</strong> bài</li>
              <li>Chưa có Meta: <strong>{stats.noMeta}</strong> bài</li>
              <li>Bài cần cập nhật (&gt;30 ngày): <strong>{stats.stale}</strong> bài</li>
            </ul>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <h2 className="font-semibold text-zinc-900">Quick Actions</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/marketing/articles" className="rounded-lg bg-admin-600 px-3 py-2 text-sm font-medium text-white hover:bg-admin-700">+ Bài viết mới</Link>
              <Link href="/marketing/media" className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200">Upload Media</Link>
              <Link href="/marketing/seo" className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200">SEO Settings</Link>
            </div>
          </div>
        </div>
      </div>
    </RequirePermission>
  );
}
