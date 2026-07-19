'use client';

import { mediaFullUrl } from '@/components/marketing/MediaLibraryPicker';
import { resolvePublicUrl } from '@/lib/public-url';

function OgCard({
  platform,
  title,
  description,
  image,
  url,
  accent,
}: {
  platform: string;
  title: string;
  description: string;
  image: string;
  url: string;
  accent: string;
}) {
  const img = image ? mediaFullUrl(image) : null;
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200">
      <p className={`px-2 py-1 text-[10px] font-bold uppercase ${accent}`}>{platform}</p>
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" className="aspect-[1.91/1] w-full object-cover" />
      ) : (
        <div className="flex aspect-[1.91/1] items-center justify-center bg-zinc-100 text-xs text-zinc-400">Không có ảnh</div>
      )}
      <div className="p-2">
        <p className="truncate text-[10px] uppercase text-zinc-400">{new URL(resolvePublicUrl(url)).hostname}</p>
        <p className="line-clamp-2 text-xs font-semibold text-zinc-900">{title || 'Tiêu đề'}</p>
        <p className="line-clamp-2 text-[11px] text-zinc-500">{description || 'Mô tả'}</p>
      </div>
    </div>
  );
}

export function OpenGraphPreview({
  title,
  description,
  image,
  url,
}: {
  title: string;
  description: string;
  image: string;
  url: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-medium uppercase text-zinc-400">OpenGraph Preview</p>
      <div className="grid grid-cols-2 gap-2">
        <OgCard platform="Facebook" title={title} description={description} image={image} url={url} accent="bg-blue-50 text-blue-700" />
        <OgCard platform="Telegram" title={title} description={description} image={image} url={url} accent="bg-sky-50 text-sky-700" />
        <OgCard platform="Zalo" title={title} description={description} image={image} url={url} accent="bg-blue-50 text-blue-800" />
        <OgCard platform="X" title={title} description={description} image={image} url={url} accent="bg-zinc-100 text-zinc-800" />
      </div>
    </div>
  );
}
