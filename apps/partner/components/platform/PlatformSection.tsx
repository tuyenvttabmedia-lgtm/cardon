'use client';

import { Card } from '@/components/ui/Card';

export function PlatformSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function FoundationNotice({
  title = 'Sắp phát triển',
  detail,
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <Card className="border-dashed border-indigo-200 bg-indigo-50/40">
      <p className="text-sm font-semibold text-indigo-900">{title}</p>
      <p className="mt-2 text-sm text-indigo-800/80">
        {detail ?? 'Kiến trúc và điều hướng đã sẵn sàng. Luồng nghiệp vụ sẽ triển khai ở mốc tiếp theo.'}
      </p>
    </Card>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <Card>
      <p className="text-sm text-slate-500">{message}</p>
    </Card>
  );
}
