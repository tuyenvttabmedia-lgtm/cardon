import type { HomeCardCategory, HomeCategory } from '@/lib/home-catalog';

export type CheckoutShellMode = 'CARD' | 'TOPUP' | 'DATA';

export type CheckoutServiceDefinition = {
  id: HomeCategory;
  mode: CheckoutShellMode;
  title: string;
  description: string;
  /** Crawlable route for external navigation; null = inline CARD on homepage */
  href: string | null;
  prefetch?: boolean;
};

/** Registry — add future services (Google Play, Steam, etc.) here only. */
export const CHECKOUT_SERVICE_REGISTRY: CheckoutServiceDefinition[] = [
  {
    id: 'game',
    mode: 'CARD',
    title: 'Thẻ game',
    description: 'Garena, Zing, Steam…',
    href: null,
  },
  {
    id: 'phone',
    mode: 'CARD',
    title: 'Thẻ điện thoại',
    description: 'Viettel, Mobi, Vina…',
    href: null,
  },
  {
    id: 'topup',
    mode: 'TOPUP',
    title: 'Nạp cước',
    description: 'Nạp trực tiếp số điện thoại',
    href: '/nap-cuoc',
    prefetch: true,
  },
  {
    id: 'data',
    mode: 'DATA',
    title: 'Nạp Data',
    description: 'Gói data 3G/4G/5G',
    href: '/nap-data',
    prefetch: true,
  },
];

export function checkoutServiceById(id: HomeCategory): CheckoutServiceDefinition | undefined {
  return CHECKOUT_SERVICE_REGISTRY.find((s) => s.id === id);
}

export function checkoutModeActiveService(
  mode: CheckoutShellMode,
  cardCategory: HomeCardCategory,
): HomeCategory {
  if (mode === 'TOPUP') return 'topup';
  if (mode === 'DATA') return 'data';
  return cardCategory;
}

export function homeCardServiceHref(category: HomeCardCategory): string {
  if (category === 'game') return '/?category=game';
  return '/?category=phone';
}
