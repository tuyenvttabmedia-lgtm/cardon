'use client';

import { useMemo, useState } from 'react';
import { getBlogListImageCandidates } from '@/lib/blog-utils';
import { resolveAssetUrl } from '@/lib/assets';
import { cn } from '@/lib/utils';

interface BlogListImageProps {
  src: string;
  alt: string;
  className?: string;
}

/** Homepage/list thumbnails — prefers pre-sized card (640px) over full-res originals. */
export function BlogListImage({ src, alt, className }: BlogListImageProps) {
  const candidates = useMemo(() => getBlogListImageCandidates(src), [src]);
  const [index, setIndex] = useState(0);
  const current = candidates[Math.min(index, candidates.length - 1)];
  const resolved = resolveAssetUrl(current) ?? current;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolved}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn('h-full w-full object-cover', className)}
      onError={() => {
        setIndex((prev) => (prev < candidates.length - 1 ? prev + 1 : prev));
      }}
    />
  );
}
