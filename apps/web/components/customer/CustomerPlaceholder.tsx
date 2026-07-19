'use client';

export function FoundationNotice({
  title = 'Sắp phát triển',
  detail,
}: {
  title?: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-sky-200 bg-sky-50/50 p-6">
      <p className="text-sm font-semibold text-sky-900">{title}</p>
      <p className="mt-2 text-sm text-sky-800/90">{detail}</p>
    </div>
  );
}
