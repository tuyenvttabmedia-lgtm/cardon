'use client';

import { CheckoutShell } from '@/components/checkout/CheckoutShell';
import { NewsSection } from '@/components/home/NewsSection';
import { FaqSection } from '@/components/faq/FaqSection';
import type { PublicBlogPost } from '@/lib/cms-api';

export function HomePageClient({ newsPosts }: { newsPosts: PublicBlogPost[] }) {
  return (
    <>
      <CheckoutShell mode="CARD" initialCategory="game" anchorId="buy-card" />
      <div className="min-h-[280px]">
        <NewsSection posts={newsPosts} />
      </div>
      <FaqSection featured limit={10} showViewAll className="mt-8" />
    </>
  );
}
