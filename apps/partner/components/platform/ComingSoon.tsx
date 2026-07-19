'use client';

import { Card } from '@/components/ui/Card';

export function ComingSoon({
  title = 'Sắp phát triển',
  detail = 'Tính năng này thuộc hệ thống quản trị nội bộ và không nằm trong phạm vi cổng đại lý B2B.',
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <Card className="mx-auto max-w-lg border-dashed border-amber-200 bg-amber-50/60">
      <p className="text-lg font-semibold text-amber-900">{title}</p>
      <p className="mt-2 text-sm text-amber-800">{detail}</p>
    </Card>
  );
}
