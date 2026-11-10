'use client';

import Image from 'next/image';
import type { FormEvent, ReactNode } from 'react';
import { useT } from '@/components/i18n/LocaleProvider';
import { resolveAssetUrl } from '@/lib/assets';
import { cn } from '@/lib/utils';

export type StorefrontHeroProps = {
  /** Background image URL (CMS or bundled default). */
  backgroundUrl?: string | null;
  badge?: string;
  /** Visual title. Use headingLevel="h1" on home; hubs keep SEO H1 in HubSeoJsonLd. */
  title: string;
  subtitle?: string;
  headingLevel?: 'h1' | 'p';
  /**
   * `home` — tall banner, soft bleed into category cards.
   * `hub` — same visual language, but clipped so the body never sits under the header/hero text.
   */
  variant?: 'home' | 'hub';
  search?: {
    id: string;
    value: string;
    placeholder: string;
    label: string;
    onChange: (value: string) => void;
    onSubmit: (event: FormEvent) => void;
  };
  /** Chips / popular links under the search (or under subtitle when no search). */
  belowSearch?: ReactNode;
  className?: string;
  children?: ReactNode;
};

/**
 * Full-bleed hero shared by home and purchase hubs.
 * LCP uses next/image (priority) instead of multi‑MB CSS background PNGs.
 */
export function StorefrontHero({
  backgroundUrl,
  badge,
  title,
  subtitle,
  headingLevel = 'p',
  variant = 'home',
  search,
  belowSearch,
  className,
  children,
}: StorefrontHeroProps) {
  const t = useT();
  const heroSrc = resolveAssetUrl(backgroundUrl);
  const badgeText = badge ?? t('home.badge');
  const TitleTag = headingLevel;
  const isHub = variant === 'hub';
  const isLocal = Boolean(heroSrc?.startsWith('/'));

  return (
    <section
      className={cn(
        'home-hero-banner relative',
        isHub && 'home-hero-banner--hub',
        className,
      )}
    >
      {heroSrc ? (
        <div className="home-hero-media" aria-hidden>
          {isLocal ? (
            <Image
              src={heroSrc}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover object-top"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- remote CMS hero URL
            <img src={heroSrc} alt="" className="h-full w-full object-cover object-top" />
          )}
        </div>
      ) : null}
      <div className="site-container relative z-10 pb-2 lg:flex lg:items-start lg:pb-6 lg:pt-4 xl:h-full xl:items-center xl:pb-4 xl:pt-0">
        <div className="relative max-w-xl lg:max-w-[30rem]">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-x-3 -inset-y-2 -z-10 rounded-[28px] bg-[linear-gradient(90deg,rgba(255,255,255,0.82)_0%,rgba(255,255,255,0.66)_70%,rgba(255,255,255,0)_100%)]"
          />
          {badgeText ? (
            <p className="inline-flex w-fit rounded-full bg-white px-3 py-1 text-xs font-semibold text-cardon-blue shadow-sm">
              {badgeText}
            </p>
          ) : null}
          <TitleTag
            className={cn(
              'mt-3 max-w-xl text-[1.75rem] font-extrabold leading-[1.12] tracking-tight text-[#07142b] md:text-[2.15rem] xl:text-[2.35rem]',
              !badgeText && 'mt-0',
            )}
          >
            {title}
          </TitleTag>
          {subtitle ? (
            <p className="mt-3 max-w-lg text-[17px] font-medium leading-snug text-[#1c2a44]">
              {subtitle}
            </p>
          ) : null}
          {search ? (
            <form onSubmit={search.onSubmit} className="relative mt-4 max-w-lg">
              <label className="sr-only" htmlFor={search.id}>
                {search.label}
              </label>
              <input
                id={search.id}
                value={search.value}
                onChange={(event) => search.onChange(event.target.value)}
                placeholder={search.placeholder}
                className="h-14 w-full rounded-full border border-white bg-white pl-5 pr-16 text-base text-[#07142b] shadow-md outline-none ring-1 ring-black/5 placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-cardon-blue"
              />
              <button
                type="submit"
                aria-label={t('nav.search')}
                className="absolute top-1.5 right-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-cardon-blue text-white hover:bg-cardon-navy focus-visible:ring-2 focus-visible:ring-cardon-blue"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
                  <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
                  <path d="M16 16.5 20 20.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </form>
          ) : null}
          {belowSearch}
          {children}
        </div>
      </div>
    </section>
  );
}
