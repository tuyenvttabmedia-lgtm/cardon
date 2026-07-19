'use client';

import { memo } from 'react';
import { mediaFullUrl } from '@/components/marketing/MediaLibraryPicker';
import { Button } from '@/components/ui/Form';

export function FeaturedImageField({
  value,
  onReplace,
  onRemove,
  onCrop,
}: {
  value: string;
  onReplace: () => void;
  onRemove: () => void;
  onCrop: () => void;
}) {
  const url = value ? mediaFullUrl(value) : '';

  if (!url) {
    return (
      <button
        type="button"
        onClick={onReplace}
        className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50 py-8 text-sm text-zinc-500 hover:border-admin-400 hover:bg-admin-50/50"
      >
        <span className="text-2xl">🖼</span>
        <span className="mt-2 font-medium">Chọn ảnh đại diện</span>
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-zinc-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Featured" className="aspect-video w-full object-cover" />
      </div>
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="secondary" type="button" onClick={onReplace}>Replace</Button>
        <Button size="sm" variant="ghost" type="button" onClick={onCrop}>Crop</Button>
        <Button size="sm" variant="ghost" type="button" onClick={onRemove}>Remove</Button>
      </div>
    </div>
  );
}

export const PanelCard = memo(function PanelCard({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-zinc-200 bg-white shadow-sm">
      <summary className="cursor-pointer list-none px-4 py-3 text-xs font-bold uppercase tracking-wide text-zinc-600 marker:content-none">
        {title}
      </summary>
      <div className="border-t border-zinc-100 px-4 pb-4 pt-3">{children}</div>
    </details>
  );
});
