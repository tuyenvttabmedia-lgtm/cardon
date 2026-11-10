'use client';

import { Suspense } from 'react';
import { CustomersPageClient } from '@/components/customers/CustomersPageClient';

export default function CustomersPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-500">Đang tải…</p>}>
      <CustomersPageClient />
    </Suspense>
  );
}
