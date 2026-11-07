import type { CSSProperties } from 'react';
import { resolveAssetUrl } from '@/lib/assets';

export type HomeBackgrounds = {
  homeHeroBg: string;
  homeCategoryGameBg: string;
  homeCategoryPhoneCardBg: string;
  homeCategoryTopupBg: string;
  homeCategoryEsimBg: string;
  /** Full-bleed hero on /the-game (CMS override; defaults differ from home). */
  hubHeroGameBg: string;
  hubHeroPhoneBg: string;
  hubHeroTopupBg: string;
  hubHeroEsimBg: string;
  siteFooterBg: string;
};

/** Bundled design files. CMS values override these when set. */
export const HOME_BACKGROUND_DEFAULTS: HomeBackgrounds = {
  homeHeroBg: '/images/home/backgrounds/banner-header-4.png',
  homeCategoryGameBg: '/images/home/backgrounds/category-game-2.png',
  homeCategoryPhoneCardBg: '/images/home/backgrounds/category-phone-2.png',
  homeCategoryTopupBg: '/images/home/backgrounds/category-topup-2.png',
  homeCategoryEsimBg: '/images/home/backgrounds/category-esim-2.png',
  hubHeroGameBg: '/images/home/backgrounds/banner-header-1.png',
  hubHeroPhoneBg: '/images/home/backgrounds/banner-header-2.png',
  hubHeroTopupBg: '/images/home/backgrounds/banner-header-3.png',
  hubHeroEsimBg: '/images/esim/hero.png',
  siteFooterBg: '/images/home/backgrounds/footer.jpg',
};

export function resolveHomeBackgrounds(
  stored?: Partial<HomeBackgrounds> | null,
): HomeBackgrounds {
  const next = { ...HOME_BACKGROUND_DEFAULTS };
  if (!stored) return next;
  (Object.keys(HOME_BACKGROUND_DEFAULTS) as Array<keyof HomeBackgrounds>).forEach((key) => {
    const value = stored[key]?.trim();
    if (value) next[key] = value;
  });
  return next;
}

/** Decorative layer. Position is explicit so the illustration stays on the intended side. */
export function backgroundLayer(
  url: string | null | undefined,
  position: string,
  size = 'cover',
): CSSProperties | undefined {
  const src = resolveAssetUrl(url);
  if (!src) return undefined;
  return {
    backgroundImage: `url("${src}")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: position,
    backgroundSize: size,
  };
}
