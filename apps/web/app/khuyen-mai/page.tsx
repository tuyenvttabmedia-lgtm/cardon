import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BlogListClient } from '@/components/blog/BlogListClient';
import { listBlogPosts } from '@/lib/cms-api';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Khuyến mãi — CardOn.vn',
  description: 'Chương trình khuyến mãi, ưu đãi mua thẻ game và nạp cước tại CardOn.vn',
  path: '/khuyen-mai',
});

export default async function KhuyenMaiPage() {
  const posts = (await listBlogPosts({ category: 'promotion', take: 100 })) ?? [];

  return (
    <Suspense fallback={<p className="page-shell text-center text-cardon-gray">Đang tải...</p>}>
      <BlogListClient
        posts={posts}
        pageTitle="Khuyến mãi"
        pageSubtitle="Ưu đãi và chương trình khuyến mãi mới nhất"
        breadcrumbLabel="Khuyến mãi"
        lockedCategory="promotion"
        listBasePath="/khuyen-mai"
      />
    </Suspense>
  );
}
