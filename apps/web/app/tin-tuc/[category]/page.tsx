import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { Suspense } from 'react';
import { BlogListClient } from '@/components/blog/BlogListClient';
import { getBlogCategory, getBlogPost, listBlogPosts } from '@/lib/cms-api';
import { BLOG_BASE_PATH, blogCategoryPath, blogPostPath } from '@/lib/routes';
import { buildMetadata, titleAlreadyBranded } from '@/lib/seo';
import { getSiteUrl } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function resolveCategoryPath(slug: string, canonicalUrl?: string | null): string {
  const fallback = blogCategoryPath(slug);
  if (!canonicalUrl?.trim()) return fallback;
  const site = getSiteUrl();
  const raw = canonicalUrl.trim();
  if (raw.startsWith(site)) {
    const stripped = raw.slice(site.length).trim() || fallback;
    return stripped.startsWith('/') ? stripped : `/${stripped}`;
  }
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return fallback;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  const data = await getBlogCategory(category);
  if (!data) {
    return buildMetadata({
      title: 'Không tìm thấy danh mục',
      path: blogCategoryPath(category),
      robots: 'noindex,follow',
    });
  }

  const path = resolveCategoryPath(category, data.canonicalUrl);
  const title = (data.metaTitle?.trim() || `${data.name} — Tin tức CardOn`).trim();
  const description =
    data.metaDescription?.trim() ||
    data.description?.trim() ||
    data.intro?.trim() ||
    `Tin tức ${data.name} trên CardOn.vn`;

  const meta = buildMetadata({
    title,
    description,
    path,
    ogImage: data.ogImageUrl ?? undefined,
  });

  if (titleAlreadyBranded(title) || data.metaTitle?.trim()) {
    return { ...meta, title: { absolute: title } };
  }
  return meta;
}

export default async function TinTucCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const categoryData = await getBlogCategory(category);

  if (!categoryData) {
    const legacyPost = await getBlogPost(category);
    if (legacyPost?.post) {
      permanentRedirect(blogPostPath(legacyPost.post.categorySlug, legacyPost.post.slug));
    }
    notFound();
  }

  const posts = (await listBlogPosts({ category, take: 100 })) ?? [];

  return (
    <Suspense fallback={<p className="page-shell text-center text-cardon-gray">Đang tải...</p>}>
      <BlogListClient
        posts={posts}
        pageTitle={categoryData.name}
        pageSubtitle={categoryData.intro ?? categoryData.description ?? 'Tin tức theo danh mục'}
        breadcrumbLabel={categoryData.name}
        lockedCategory={category}
        categoryIntro={categoryData.intro ?? categoryData.description}
        postBasePath={BLOG_BASE_PATH}
        listBasePath={blogCategoryPath(category)}
      />
    </Suspense>
  );
}
