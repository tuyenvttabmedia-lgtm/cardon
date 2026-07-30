'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { listBanners, type CmsBanner } from '@/lib/cms-api';
import { cn } from '@/lib/utils';

export type HeroBannerVariant = 'card' | 'topup' | 'data';

/** Fixed hero height so checkout alignment stays stable when switching services. */
export const SERVICE_HERO_SHELL_CLASS =
  'relative min-h-[180px] overflow-hidden rounded-2xl md:min-h-[340px] md:rounded-3xl';

const AUTOPLAY_MS = 5500;

let cachedHomeHeroBanners: CmsBanner[] | undefined;

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

function SlideImage({ banner, priority }: { banner: CmsBanner; priority?: boolean }) {
  return (
    <Image
      src={banner.imageUrl}
      alt={banner.title}
      fill
      className="object-contain object-center md:object-cover"
      priority={priority}
      unoptimized
    />
  );
}

function HeroCarousel({ banners }: { banners: CmsBanner[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = banners.length;

  const go = useCallback(
    (next: number) => {
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  useEffect(() => {
    if (count <= 1 || paused) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [count, paused]);

  const current = banners[index];

  return (
    <div
      className={cn(
        SERVICE_HERO_SHELL_CLASS,
        'group bg-gradient-to-r from-cardon-navy via-cardon-blue to-cardon-blue',
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
    >
      <div className="absolute inset-0">
        {banners.map((banner, i) => {
          const active = i === index;
          const body = <SlideImage banner={banner} priority={i === 0} />;
          const frame = (
            <div
              key={banner.id}
              className={cn(
                'absolute inset-0 transition-opacity duration-500 ease-out',
                active ? 'opacity-100' : 'pointer-events-none opacity-0',
              )}
              aria-hidden={!active}
            >
              {banner.linkUrl ? (
                <Link href={banner.linkUrl} className="absolute inset-0 block" tabIndex={active ? 0 : -1}>
                  {body}
                </Link>
              ) : (
                body
              )}
            </div>
          );
          return frame;
        })}
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Banner trước"
            className="absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white opacity-90 backdrop-blur transition hover:bg-black/50 md:left-3 md:h-11 md:w-11 md:opacity-0 md:group-hover:opacity-100"
            onClick={() => go(index - 1)}
          >
            <span aria-hidden className="text-lg leading-none md:text-xl">
              ‹
            </span>
          </button>
          <button
            type="button"
            aria-label="Banner sau"
            className="absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white opacity-90 backdrop-blur transition hover:bg-black/50 md:right-3 md:h-11 md:w-11 md:opacity-0 md:group-hover:opacity-100"
            onClick={() => go(index + 1)}
          >
            <span aria-hidden className="text-lg leading-none md:text-xl">
              ›
            </span>
          </button>

          <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5 md:bottom-4">
            {banners.map((banner, i) => (
              <button
                key={banner.id}
                type="button"
                aria-label={`Chuyển tới banner ${i + 1}`}
                aria-current={i === index}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80',
                )}
                onClick={() => go(i)}
              />
            ))}
          </div>
        </>
      )}

      <span className="sr-only">
        Banner {index + 1}/{count}: {current?.title}
      </span>
    </div>
  );
}

export function HeroBanner({ variant = 'card' }: { variant?: HeroBannerVariant }) {
  const [banners, setBanners] = useState<CmsBanner[]>(cachedHomeHeroBanners ?? []);
  const [loaded, setLoaded] = useState(cachedHomeHeroBanners !== undefined);

  useEffect(() => {
    if (cachedHomeHeroBanners !== undefined) {
      setBanners(cachedHomeHeroBanners);
      setLoaded(true);
      return;
    }

    void listBanners('HOME_HERO').then((rows) => {
      const withImage = (rows ?? []).filter((row) => Boolean(row.imageUrl));
      cachedHomeHeroBanners = withImage;
      setBanners(withImage);
      setLoaded(true);
    });
  }, []);

  if (!loaded) {
    return <HeroSkeleton />;
  }

  if (banners.length > 0) {
    return <HeroCarousel banners={banners} />;
  }

  return <HeroFallback variant={variant} />;
}
