import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import { Suspense } from 'react';
import { BlogListClient } from '@/components/blog/BlogListClient';
import { listBlogPosts } from '@/lib/cms-api';
import { BLOG_BASE_PATH } from '@/lib/routes';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({
  title: 'Tin tức — CardOn.vn',
  description: 'Tin tức, khuyến mãi và hướng dẫn mua thẻ game, nạp cước tại CardOn.vn',
  path: BLOG_BASE_PATH,
});

export default async function TinTucPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string; q?: string }>;
}) {
  const params = await searchParams;
  if (params.category) {
    permanentRedirect(`${BLOG_BASE_PATH}/${params.category}`);
  }

  const posts = (await listBlogPosts({ take: 100 })) ?? [];

  return (
    <Suspense fallback={<p className="page-shell text-center text-cardon-gray">Đang tải...</p>}>
      <BlogListClient posts={posts} postBasePath={BLOG_BASE_PATH} listBasePath={BLOG_BASE_PATH} />
    </Suspense>
  );
}
