'use client';

import { BlogListClient } from '@/components/blog/BlogListClient';
import { GuideFaqBlock } from '@/components/faq/GuideFaqBlock';
import type { PublicBlogPost } from '@/lib/cms-api';

export function HuongDanPageClient({ posts }: { posts: PublicBlogPost[] }) {
  return (
    <>
      <BlogListClient
        posts={posts}
        pageTitle="Hướng dẫn"
        pageSubtitle="Cách mua thẻ, thanh toán và các câu hỏi thường gặp"
        breadcrumbLabel="Hướng dẫn"
        lockedCategory="guide"
        listBasePath="/huong-dan"
      />
      <div className="page-shell">
        <GuideFaqBlock limit={15} />
      </div>
    </>
  );
}
