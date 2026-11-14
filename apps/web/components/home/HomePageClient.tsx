'use client';

import { CheckoutShell } from '@/components/checkout/CheckoutShell';
import { FaqSection } from '@/components/faq/FaqSection';
import { HelpIcon } from '@/components/icons/SectionGlyph';
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
        limit={5}
        showViewAll
        icon={<HelpIcon />}
        className="mt-6"
        initialItems={initialFaqs}
      />
    </>
  );
}
