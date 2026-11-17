'use client';

import { CheckoutShell } from '@/components/checkout/CheckoutShell';
import { FaqSection } from '@/components/faq/FaqSection';
import { HelpIcon } from '@/components/icons/SectionGlyph';
import { HubGuideLinks } from '@/components/seo/HubGuideLinks';
import type { PublicFaqItem } from '@/lib/cms-api';
import { CARD_GAME_PATH, CARD_PHONE_PATH } from '@/lib/checkout-services';
import type { HomeCardCategory } from '@/lib/home-catalog';

export function HomePageClient({
  initialCategory = 'game',
  initialFaqs,
}: {
  initialCategory?: HomeCardCategory;
  initialFaqs?: PublicFaqItem[];
}) {
  const guidePath = initialCategory === 'phone' ? CARD_PHONE_PATH : CARD_GAME_PATH;
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
      <HubGuideLinks path={guidePath} />
    </>
  );
}
