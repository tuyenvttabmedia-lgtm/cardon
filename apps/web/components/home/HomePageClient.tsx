'use client';

import { CheckoutShell } from '@/components/checkout/CheckoutShell';
import { FaqSection } from '@/components/faq/FaqSection';
import type { PublicFaqItem } from '@/lib/cms-api';
import type { HomeCardCategory } from '@/lib/home-catalog';

export function HomePageClient({
  initialCategory = 'game',
  initialFaqs,
}: {
  initialCategory?: HomeCardCategory;
  initialFaqs?: PublicFaqItem[];
}) {
  return (
    <>
      <CheckoutShell mode="CARD" initialCategory={initialCategory} anchorId="buy-card" />
      <FaqSection
        featured
        limit={10}
        showViewAll
        className="mt-6 pb-28 md:pb-0"
        initialItems={initialFaqs}
      />
    </>
  );
}
