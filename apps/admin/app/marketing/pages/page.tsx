'use client';

import { ProfessionalCmsManager } from '@/components/marketing/cms-editor/ProfessionalCmsManager';
import { vi } from '@/lib/i18n/vi';

export default function StaticPagesPage() {
  return <ProfessionalCmsManager pageType="PAGE" title={vi.cms.pagesTitle} />;
}
