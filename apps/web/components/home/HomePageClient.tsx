'use client';

import { CheckoutShell } from '@/components/checkout/CheckoutShell';
import { NewsSection } from '@/components/home/NewsSection';
import { FaqSection } from '@/components/faq/FaqSection';
import type { PublicBlogPost, PublicFaqItem } from '@/lib/cms-api';
import type { HomeCardCategory } from '@/lib/home-catalog';

export function HomePageClient({
  newsPosts,
  initialCategory = 'game',
  initialFaqs,
}: {
  newsPosts: PublicBlogPost[];
  initialCategory?: HomeCardCategory;
  initialFaqs?: PublicFaqItem[];
}) {
  return (
    <>
      <CheckoutShell mode="CARD" initialCategory={initialCategory} anchorId="buy-card" />
      <div className="min-h-[280px]">
        <NewsSection posts={newsPosts} />
      </div>
      <FaqSection featured limit={10} showViewAll className="mt-8" initialItems={initialFaqs} />
    </>
  );
}
