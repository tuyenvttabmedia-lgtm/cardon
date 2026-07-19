'use client';

import { resolveAssetUrl } from '@/lib/assets';
import { providerColor, providerInitial } from '@/lib/home-catalog';
import { cn } from '@/lib/utils';

export type CustomerProductKind = 'card' | 'topup' | 'data';

const LOGO_IMG_CLASS = 'max-h-[85%] max-w-[85%] object-contain';
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
}: {
  name: string;
  slug: string;
  logoUrl?: string | null;
  kind?: CustomerProductKind;
  fallbackLabel?: string;
}) {
  const resolved = resolveAssetUrl(logoUrl);

  if (resolved) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={resolved} alt="" aria-hidden className={LOGO_IMG_CLASS} />
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
