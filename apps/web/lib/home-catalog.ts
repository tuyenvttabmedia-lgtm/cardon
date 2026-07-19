'use client';



import { resolveAssetUrl } from '@/lib/assets';

import type { Category, HomeServiceType, Product } from '@/types/api';



export type HomeCardCategory = 'game' | 'phone';

export type HomeCategory = HomeCardCategory | 'topup' | 'data';



export const HOME_CATEGORY_TABS: Array<{

  id: HomeCategory;

  homeService: HomeServiceType;

  title: string;

  description: string;

  fallbackEmoji: string;

  accent: string;

}> = [

  {

    id: 'game',

    homeService: 'GAME_CARD',

    title: 'Thẻ game',

    description: 'Garena, Zing, Steam…',

    fallbackEmoji: '🎮',

    accent: 'border-cardon-blue bg-blue-50 text-cardon-blue',

  },

  {

    id: 'phone',

    homeService: 'PHONE_CARD',

    title: 'Thẻ điện thoại',

    description: 'Viettel, Mobi, Vina…',

    fallbackEmoji: '📱',

    accent: 'border-cardon-green bg-emerald-50 text-cardon-green',

  },

  {

    id: 'topup',

    homeService: 'TOPUP',

    title: 'Nạp cước',

    description: 'Nạp trực tiếp số điện thoại',

    fallbackEmoji: '⚡',

    accent: 'border-purple-500 bg-purple-50 text-purple-700',

  },

  {

    id: 'data',

    homeService: 'DATA',

    title: 'Nạp Data',

    description: 'Gói data 3G/4G/5G',

    fallbackEmoji: '📶',

    accent: 'border-orange-400 bg-orange-50 text-cardon-orange',

  },

];



export type HomeServiceTab = (typeof HOME_CATEGORY_TABS)[number];



const HOME_SERVICE_TO_TAB = new Map<HomeServiceType, HomeCategory>(

  HOME_CATEGORY_TABS.map((tab) => [tab.homeService, tab.id]),

);



export function homeServiceToHomeCategory(homeService: HomeServiceType): HomeCategory | null {

  return HOME_SERVICE_TO_TAB.get(homeService) ?? null;

}



export function homeCategoryToHomeService(category: HomeCategory): HomeServiceType {

  const tab = HOME_CATEGORY_TABS.find((t) => t.id === category);

  return tab?.homeService ?? 'GAME_CARD';

}



/** CARD tabs stay on homepage checkout; TOPUP/DATA navigate to dedicated pages. */

export function isHomeCardService(id: HomeCategory): id is HomeCardCategory {

  return id === 'game' || id === 'phone';

}



export function homeServiceNavHref(id: HomeCategory): string | null {

  if (id === 'topup') return '/nap-cuoc';

  if (id === 'data') return '/nap-data';

  return null;

}



function isActiveCatalogProduct(product: Product): boolean {

  if (product.status !== 'ACTIVE') return false;

  const variants = (product.variants ?? []).filter((v) => v.status === 'ACTIVE');

  return variants.length > 0;

}



export function productHomeCategory(product: Product): HomeCategory | null {

  const homeService = product.homeService ?? product.category?.homeService;

  if (!homeService) return null;

  return homeServiceToHomeCategory(homeService);

}



/** Show service tabs only when catalog has active products for that service type. */

export function getVisibleHomeServiceTabs(products: Product[]): HomeServiceTab[] {

  return HOME_CATEGORY_TABS.filter(

    (tab) => filterProductsByHomeCategory(products, tab.id).length > 0,

  );

}



/** Homepage purchase block — CARD categories only. */

export const HOME_CARD_CATEGORY_TABS = HOME_CATEGORY_TABS.filter(

  (tab): tab is (typeof HOME_CATEGORY_TABS)[number] & { id: HomeCardCategory } =>

    tab.id === 'game' || tab.id === 'phone',

);



/** @deprecated use HOME_CATEGORY_TABS */

export const HOME_CATEGORIES = HOME_CATEGORY_TABS;



export function filterProductsByHomeCategory(products: Product[], category: HomeCategory) {

  const targetService = homeCategoryToHomeService(category);



  const filtered = products.filter((p) => {

    if (!isActiveCatalogProduct(p)) return false;

    const homeService = p.homeService ?? p.category?.homeService;

    return homeService === targetService;

  });



  return filtered.sort((a, b) => {

    const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);

    if (orderDiff !== 0) return orderDiff;

    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;

    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;

    return aTime - bTime;

  });

}



export function pickFirstHomeCategoryWithProducts(products: Product[]): HomeCategory {

  for (const tab of HOME_CATEGORY_TABS) {

    if (filterProductsByHomeCategory(products, tab.id).length > 0) {

      return tab.id;

    }

  }

  return 'game';

}



export function pickFirstCardHomeCategoryWithProducts(products: Product[]): HomeCardCategory {

  for (const tab of HOME_CARD_CATEGORY_TABS) {

    if (filterProductsByHomeCategory(products, tab.id).length > 0) {

      return tab.id;

    }

  }

  return 'game';

}



export function resolveCardCategoryIcons(

  products: Product[],

  categories: Category[],

): Record<HomeCardCategory, string | null> {

  const full = resolveHomeCategoryIcons(products, categories);

  return {

    game: full.game,

    phone: full.phone,

  };

}



export function providerInitial(name: string): string {

  return name.trim().charAt(0).toUpperCase();

}



export function providerColor(slug: string): string {

  const s = slug.toLowerCase();

  if (s.includes('garena')) return 'bg-orange-500';

  if (s.includes('zing')) return 'bg-green-600';

  if (s.includes('viettel')) return 'bg-red-600';

  if (s.includes('mobifone') || s.includes('mobi')) return 'bg-blue-600';

  if (s.includes('vina')) return 'bg-sky-600';

  if (s.includes('vcoin')) return 'bg-purple-600';

  return 'bg-cardon-blue';

}



/** Resolve iconUrl per home tab from API categories + product associations. */

export function resolveHomeCategoryIcons(

  products: Product[],

  categories: Category[],

): Record<HomeCategory, string | null> {

  const icons = {} as Record<HomeCategory, string | null>;



  for (const tab of HOME_CATEGORY_TABS) {

    let url: string | null = null;



    const serviceMatch = categories.find(

      (c) => c.iconUrl && c.homeService === tab.homeService,

    );

    if (serviceMatch?.iconUrl) {

      url = resolveAssetUrl(serviceMatch.iconUrl);

    }



    if (!url) {

      const tabProducts = filterProductsByHomeCategory(products, tab.id);

      for (const p of tabProducts) {

        const fromProduct = categories.find((c) => c.id === p.categoryId);

        if (fromProduct?.iconUrl) {

          url = resolveAssetUrl(fromProduct.iconUrl);

          break;

        }

      }

    }



    icons[tab.id] = url;

  }



  return icons;

}


