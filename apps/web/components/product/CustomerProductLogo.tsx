'use client';

import Image from 'next/image';
import { isOptimizableImageSrc, optimizerImageSrc, resolveAssetUrl } from '@/lib/assets';
import { providerColor, providerInitial } from '@/lib/home-catalog';
import { cn } from '@/lib/utils';

export type CustomerProductKind = 'card' | 'topup' | 'data';

const LOGO_IMG_CLASS = 'max-h-[85%] max-w-[85%] object-contain';
const ROOMY_LOGO_CLASS = 'h-14 max-h-14 w-auto max-w-[92%] object-contain';
export function topupFallbackLabel(name: string): string {
  const carriers = ['Viettel', 'Mobifone', 'Vinaphone', 'Vietnamobile'];
  const lower = name.toLowerCase();
  for (const carrier of carriers) {
    if (lower.includes(carrier.toLowerCase())) return carrier;
  }
  return name.trim().split(/\s+/)[0] ?? name;
}

export function homeCategoryToProductKind(category: string): CustomerProductKind {
  if (category === 'topup') return 'topup';
  if (category === 'data') return 'data';
  return 'card';
}

export function CustomerProductLogo({
  name,
  slug,
  logoUrl,
  kind = 'card',
  fallbackLabel,
  roomy = false,
}: {
  name: string;
  slug: string;
  logoUrl?: string | null;
  kind?: CustomerProductKind;
  fallbackLabel?: string;
  /** Larger mark for the homepage logo row. Other pages keep the compact mark. */
  roomy?: boolean;
}) {
  const resolved = resolveAssetUrl(logoUrl);
  const optimized = optimizerImageSrc(logoUrl);
  const imgClass = roomy ? ROOMY_LOGO_CLASS : LOGO_IMG_CLASS;

  if (resolved && optimized && isOptimizableImageSrc(optimized)) {
    return (
      <Image
        src={optimized}
        alt=""
        aria-hidden
        width={160}
        height={64}
        quality={60}
        sizes={roomy ? '140px' : '96px'}
        className={imgClass}
        style={roomy ? { width: 'auto', height: '3.5rem' } : { width: 'auto', height: 'auto' }}
      />
    );
  }

  if (resolved) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolved}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        className={imgClass}
      />
    );
  }

  if (kind === 'topup' || kind === 'data') {
    return (
      <span className="px-1 text-center text-xs font-bold uppercase leading-tight tracking-wide text-cardon-navy md:text-sm">
        {fallbackLabel ?? topupFallbackLabel(name)}
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white md:h-10 md:w-10',
        providerColor(slug),
      )}
    >
      {providerInitial(name)}
    </span>
  );
}
