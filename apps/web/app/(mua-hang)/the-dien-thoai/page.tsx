import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HomePageClient } from '@/components/home/HomePageClient';
import { HubSeoBlock } from '@/components/seo/HubSeoBlock';
import { listBlogPosts } from '@/lib/cms-api';
import { THE_PHONE_SEO } from '@/lib/hub-seo-copy';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: THE_PHONE_SEO.title,
  description: THE_PHONE_SEO.description,
  path: THE_PHONE_SEO.path,
});

export default async function TheDienThoaiPage() {
  const newsPosts = (await listBlogPosts({ take: 8 })) ?? [];
  return (
    <>
      <HubSeoBlock
        path={THE_PHONE_SEO.path}
        title={THE_PHONE_SEO.title}
        intro={THE_PHONE_SEO.intro}
        paragraphs={THE_PHONE_SEO.paragraphs}
        bullets={THE_PHONE_SEO.bullets}
        breadcrumbLabel={THE_PHONE_SEO.breadcrumbLabel}
      />
      <Suspense fallback={<p className="text-cardon-gray">Đang tải...</p>}>
        <HomePageClient newsPosts={newsPosts} initialCategory="phone" />
      </Suspense>
    </>
  );
}
