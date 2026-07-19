'use client';

import { ProfessionalCmsManager } from '@/components/marketing/cms-editor/ProfessionalCmsManager';
import { vi } from '@/lib/i18n/vi';

export default function ArticlesPage() {
  return <ProfessionalCmsManager pageType="BLOG_POST" title={vi.cms.articlesTitle} />;
}
