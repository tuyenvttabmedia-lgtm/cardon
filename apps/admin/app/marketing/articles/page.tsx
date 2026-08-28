'use client';

import { Suspense } from 'react';
import { ProfessionalCmsManager } from '@/components/marketing/cms-editor/ProfessionalCmsManager';
import { vi } from '@/lib/i18n/vi';

export default function ArticlesPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">{vi.app.loading}</p>}>
      <ProfessionalCmsManager pageType="BLOG_POST" title={vi.cms.articlesTitle} />
    </Suspense>
  );
}
