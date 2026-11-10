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

/**
 * Prefer compressed JPG defaults (~40–100KB) over multi‑MB design PNGs.
 * CMS can still override; known heavy PNGs are remapped in resolveHomeBackgrounds.
 */
export const HOME_BACKGROUND_DEFAULTS: HomeBackgrounds = {
  homeHeroBg: '/images/home/backgrounds/hero.jpg',
  homeCategoryGameBg: '/images/home/backgrounds/category-game.jpg',
  homeCategoryPhoneCardBg: '/images/home/backgrounds/category-phone-card.jpg',
  homeCategoryTopupBg: '/images/home/backgrounds/category-topup.jpg',
  homeCategoryEsimBg: '/images/home/backgrounds/category-esim.jpg',
  hubHeroGameBg: '/images/home/backgrounds/hero.jpg',
  hubHeroPhoneBg: '/images/home/backgrounds/hero.jpg',
  hubHeroTopupBg: '/images/home/backgrounds/hero.jpg',
  hubHeroEsimBg: '/images/esim/hero.jpg',
  siteFooterBg: '/images/home/backgrounds/footer.jpg',
};

/** Legacy CMS/design PNG paths → compressed JPG counterparts. */
const HEAVY_ASSET_REMAP: Record<string, string> = {
  '/images/home/backgrounds/banner-header-1.png': '/images/home/backgrounds/hero.jpg',
  '/images/home/backgrounds/banner-header-2.png': '/images/home/backgrounds/hero.jpg',
  '/images/home/backgrounds/banner-header-3.png': '/images/home/backgrounds/hero.jpg',
  '/images/home/backgrounds/banner-header-4.png': '/images/home/backgrounds/hero.jpg',
  '/images/home/backgrounds/category-game-2.png': '/images/home/backgrounds/category-game.jpg',
  '/images/home/backgrounds/category-phone-2.png': '/images/home/backgrounds/category-phone-card.jpg',
  '/images/home/backgrounds/category-topup-2.png': '/images/home/backgrounds/category-topup.jpg',
  '/images/home/backgrounds/category-esim-2.png': '/images/home/backgrounds/category-esim.jpg',
  '/images/esim/hero.png': '/images/esim/hero.jpg',
};

function remapHeavyAsset(url: string): string {
  const pathOnly = url.split('?')[0];
  return HEAVY_ASSET_REMAP[pathOnly] ?? url;
}

export function resolveHomeBackgrounds(
  stored?: Partial<HomeBackgrounds> | null,
): HomeBackgrounds {
  const next = { ...HOME_BACKGROUND_DEFAULTS };
  if (!stored) return next;
  (Object.keys(HOME_BACKGROUND_DEFAULTS) as Array<keyof HomeBackgrounds>).forEach((key) => {
    const value = stored[key]?.trim();
    if (value) next[key] = remapHeavyAsset(value);
  });
  return next;
}

/** Decorative layer. Position is explicit so the illustration stays on the intended side. */
export function backgroundLayer(
  url: string | null | undefined,
  position: string,
  size = 'cover',
): CSSProperties | undefined {
  const raw = url?.trim() ? remapHeavyAsset(url.trim()) : url;
  const src = resolveAssetUrl(raw);
  if (!src) return undefined;
  return {
    backgroundImage: `url("${src}")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: position,
    backgroundSize: size,
  };
}
