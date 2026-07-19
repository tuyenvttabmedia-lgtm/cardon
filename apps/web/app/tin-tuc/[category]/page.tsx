import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { Suspense } from 'react';
import { BlogListClient } from '@/components/blog/BlogListClient';
import { getBlogCategory, getBlogPost, listBlogPosts } from '@/lib/cms-api';
import { BLOG_BASE_PATH, blogCategoryPath, blogPostPath } from '@/lib/routes';
import { buildMetadata } from '@/lib/seo';
import { getSiteUrl } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  const data = await getBlogCategory(category);
  if (!data) return { title: 'Không tìm thấy danh mục' };

  const path = blogCategoryPath(category);
  const title = data.metaTitle ?? `${data.name} — Tin tức CardOn`;
  const description = data.metaDescription ?? data.description ?? data.intro ?? title;
  const canonical = data.canonicalUrl?.replace(getSiteUrl(), '') ?? path;

  return buildMetadata({
    title,
    description,
    path: canonical,
    ogImage: data.ogImageUrl ?? undefined,
  });
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
