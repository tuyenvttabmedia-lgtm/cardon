import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { BlogArticlePageView, buildBlogArticleMetadata } from '@/components/blog/BlogArticlePageView';
import {
  buildStaticPageMetadata,
  CMS_STATIC_FALLBACK,
  renderStaticPage,
} from '@/lib/cms-static-page';
import { getBlogPost, getCmsPage } from '@/lib/cms-api';
import { blogPostPath } from '@/lib/routes';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const blog = await getBlogPost(slug);
  if (blog?.post) {
    return buildBlogArticleMetadata(slug);
  }
  if (!CMS_STATIC_FALLBACK[slug] && !(await getCmsPage(slug))) {
    return { title: 'Không tìm thấy trang' };
  }
  return buildStaticPageMetadata(slug);
}

export default async function RootSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const blog = await getBlogPost(slug);
  if (blog?.post) {
    if (blog.post.categorySlug) {
      permanentRedirect(blogPostPath(blog.post.categorySlug, blog.post.slug));
    }
    return <BlogArticlePageView slug={slug} />;
  }

  const page = await getCmsPage(slug);
  if (!page && !CMS_STATIC_FALLBACK[slug]) notFound();
  return renderStaticPage(slug);
}
