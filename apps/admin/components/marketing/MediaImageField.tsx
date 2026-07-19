'use client';

import { MediaPickButton, mediaFullUrl } from '@/components/marketing/MediaLibraryPicker';
import { Button } from '@/components/ui/Form';
import { Label } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';

interface MediaImageFieldProps {
  value: string;
  onChange: (url: string) => void;
  folder?: string;
  label?: string;
}

export function MediaImageField({ value, onChange, folder, label }: MediaImageFieldProps) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <div className="mt-1 flex flex-wrap items-center gap-3">
        {value ? (
          <img
            src={mediaFullUrl(value)}
            alt=""
            className="h-20 w-auto max-w-[160px] rounded border border-zinc-200 object-contain"
          />
        ) : (
          <div className="flex h-20 w-32 items-center justify-center rounded border border-dashed border-zinc-300 text-xs text-zinc-400">
            {vi.media.noImage}
          </div>
        )}
        <div className="flex gap-2">
          <MediaPickButton folder={folder} label={vi.media.pickFromLibrary} onSelect={onChange} />
          {value && (
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange('')}>
              {vi.media.clear}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
