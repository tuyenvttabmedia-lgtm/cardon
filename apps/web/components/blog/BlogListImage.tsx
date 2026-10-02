'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { getBlogListImageCandidates } from '@/lib/blog-utils';
import { isOptimizableImageSrc, optimizerImageSrc, resolveAssetUrl } from '@/lib/assets';
import { cn } from '@/lib/utils';

interface BlogListImageProps {
  src: string;
  alt: string;
  className?: string;
  /** CSS sizes for the slot this thumbnail actually occupies. */
  sizes?: string;
}

const DEFAULT_SIZES = '(max-width: 1024px) 45vw, 280px';

/** Homepage/list thumbnails — prefers pre-sized card (640px) over full-res originals. */
export function BlogListImage({ src, alt, className, sizes = DEFAULT_SIZES }: BlogListImageProps) {
  const candidates = useMemo(() => getBlogListImageCandidates(src), [src]);
  const [index, setIndex] = useState(0);
  const current = candidates[Math.min(index, candidates.length - 1)];
  const resolved = resolveAssetUrl(current) ?? current;
  const optimized = optimizerImageSrc(current) ?? resolved;
  const advance = () => {
    setIndex((prev) => (prev < candidates.length - 1 ? prev + 1 : prev));
  };

  if (isOptimizableImageSrc(optimized)) {
    return (
      <Image
        key={optimized}
        src={optimized}
        alt={alt}
        fill
        sizes={sizes}
        quality={60}
        className={cn('object-cover', className)}
        onError={advance}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolved}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn('h-full w-full object-cover', className)}
      onError={advance}
    />
  );
}
