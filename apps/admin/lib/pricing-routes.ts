import { vi } from '@/lib/i18n/vi';

export const PRICING_SECTIONS = [
  { href: '/pricing/overview', label: vi.pricing.navOverview, exact: true as const },
  { href: '/pricing/groups', label: vi.pricing.navGroups },
  { href: '/pricing/agents', label: vi.pricing.navAgentPricing },
  { href: '/pricing/providers', label: vi.pricing.navProviderPricing },
  { href: '/pricing/discounts', label: vi.pricing.navDiscounts },
  { href: '/pricing/history', label: vi.pricing.navHistory },
] as const;
