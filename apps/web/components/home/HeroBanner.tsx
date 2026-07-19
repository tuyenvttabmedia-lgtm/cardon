'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { listBanners, type CmsBanner } from '@/lib/cms-api';
import { cn } from '@/lib/utils';

export type HeroBannerVariant = 'card' | 'topup' | 'data';

/** Fixed hero height so checkout alignment stays stable when switching services. */
export const SERVICE_HERO_SHELL_CLASS =
  'relative min-h-[180px] overflow-hidden rounded-2xl md:min-h-[340px] md:rounded-3xl';

let cachedHomeHeroBanner: CmsBanner | null | undefined;

const FALLBACK_CONTENT: Record<
  HeroBannerVariant,
  {
    title: string;
    subtitle: string;
    badges: string[];
    emojis: string[];
  }
> = {
  card: {
    title: 'Mua thẻ game, thẻ điện thoại',
    subtitle: 'Nhanh chóng — Tự động — An toàn 24/7',
    badges: ['Giao mã tức thì', 'Thanh toán an toàn', 'Hỗ trợ 24/7'],
    emojis: ['🎮', '📱', '💳'],
  },
  topup: {
    title: 'Nạp cước điện thoại nhanh chóng',
    subtitle:
      'Nạp trực tiếp Viettel, Mobifone, Vinaphone, Vietnamobile — tự động 24/7, chiết khấu hấp dẫn.',
    badges: ['Nạp tự động', 'Thanh toán an toàn', 'Hỗ trợ 24/7'],
    emojis: ['📱', '💰', '⚡'],
  },
  data: {
    title: 'Nạp data 3G/4G/5G',
    subtitle: 'Mua gói data Viettel, Mobifone, Vinaphone — kích hoạt tự động, thanh toán an toàn.',
    badges: ['Kích hoạt nhanh', 'Thanh toán an toàn', 'Hỗ trợ 24/7'],
    emojis: ['📶', '⚡', '🔒'],
  },
};

function HeroSkeleton() {
  return <div className={cn(SERVICE_HERO_SHELL_CLASS, 'animate-pulse bg-gray-100')} />;
}

function HeroFallback({ variant }: { variant: HeroBannerVariant }) {
  const content = FALLBACK_CONTENT[variant];

  return (
    <div
      className={cn(
        SERVICE_HERO_SHELL_CLASS,
        'flex flex-col justify-center bg-gradient-to-r from-cardon-navy via-cardon-blue to-cardon-blue px-6 py-8 text-white md:px-12 md:py-10',
      )}
    >
      <div className="relative z-10 max-w-xl">
        <h1 className="text-2xl font-bold leading-tight md:text-4xl">{content.title}</h1>
        <p className="mt-2 text-sm text-white/90 md:mt-3 md:text-lg">{content.subtitle}</p>
        <div className="mt-4 flex flex-wrap gap-2 md:mt-6">
          {content.badges.map((badge) => (
            <span
              key={badge}
              className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur md:text-sm"
            >
              ✓ {badge}
            </span>
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute -right-8 top-1/2 hidden -translate-y-1/2 md:block">
        <div className="flex gap-2 opacity-90">
          {content.emojis.map((emoji, i) => (
            <div
              key={emoji}
              className="flex h-20 w-14 items-center justify-center rounded-xl bg-white/15 text-3xl backdrop-blur"
              style={{ transform: `rotate(${(i - 1) * 8}deg)` }}
            >
              {emoji}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HeroImageBanner({ banner }: { banner: CmsBanner }) {
  const img = (
    <div className={cn(SERVICE_HERO_SHELL_CLASS)}>
      <Image
        src={banner.imageUrl}
        alt={banner.title}
        fill
        className="object-cover"
        priority
        unoptimized
      />
    </div>
  );

  if (banner.linkUrl) {
    return (
      <Link href={banner.linkUrl} className="block">
        {img}
      </Link>
    );
  }

  return img;
}

export function HeroBanner({ variant = 'card' }: { variant?: HeroBannerVariant }) {
  const [banner, setBanner] = useState<CmsBanner | null>(
    cachedHomeHeroBanner === undefined ? null : cachedHomeHeroBanner,
  );
  const [loaded, setLoaded] = useState(cachedHomeHeroBanner !== undefined);

  useEffect(() => {
    if (cachedHomeHeroBanner !== undefined) {
      setBanner(cachedHomeHeroBanner);
      setLoaded(true);
      return;
    }

    void listBanners('HOME_HERO').then((rows) => {
      cachedHomeHeroBanner = rows?.[0] ?? null;
      setBanner(cachedHomeHeroBanner);
      setLoaded(true);
    });
  }, []);

  if (!loaded) {
    return <HeroSkeleton />;
  }

  if (banner?.imageUrl) {
    return <HeroImageBanner banner={banner} />;
  }

  return <HeroFallback variant={variant} />;
}
