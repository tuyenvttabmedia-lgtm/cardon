import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { BlogArticlePageView, buildBlogArticleMetadata } from '@/components/blog/BlogArticlePageView';
import { getBlogPost } from '@/lib/cms-api';
import { blogPostPath } from '@/lib/routes';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string; slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return buildBlogArticleMetadata(slug);
}

export default async function TinTucArticlePage({
  params,
}: {
  params: Promise<{ category: string; slug: string }>;
}) {
  const { category, slug } = await params;
  const data = await getBlogPost(slug);
  if (!data) notFound();

  const { post } = data;
  if (!post.categorySlug) {
    permanentRedirect(blogPostPath(null, post.slug));
  }
  if (post.categorySlug !== category) {
    permanentRedirect(blogPostPath(post.categorySlug, post.slug));
  }

  return <BlogArticlePageView slug={slug} />;
}
