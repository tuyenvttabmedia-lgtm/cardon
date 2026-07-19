import { HomeServiceType } from '@prisma/client';

export const AGENT_MARGIN_SETTINGS_KEY = 'settings.agent.margin';

export type MarginType = 'PERCENT' | 'FIXED';

/** Margin rule per product group (maps to Product.homeService). */
export type ServiceMarginRule = {
  marginType: MarginType;
  value: number;
};

export type AgentMarginConfig = {
  roundTo: number;
  /** ALL_AGENTS — per-agent exceptions reserved for a later phase. */
  applyScope: 'ALL_AGENTS';
  services: Record<HomeServiceType, ServiceMarginRule>;
};

/** Product group labels (Product.homeService → display name). */
export const PRODUCT_GROUP_LABELS: Record<HomeServiceType, string> = {
  GAME_CARD: 'Thẻ Game',
  PHONE_CARD: 'Thẻ Điện thoại',
  TOPUP: 'Topup',
  DATA: 'Data',
};

/** @deprecated Use PRODUCT_GROUP_LABELS */
export const HOME_SERVICE_LABELS = PRODUCT_GROUP_LABELS;

export const DEFAULT_AGENT_MARGIN_CONFIG: AgentMarginConfig = {
  roundTo: 100,
  applyScope: 'ALL_AGENTS',
  services: {
    GAME_CARD: { marginType: 'PERCENT', value: 0.5 },
    PHONE_CARD: { marginType: 'PERCENT', value: 0.5 },
    TOPUP: { marginType: 'PERCENT', value: 0.3 },
    DATA: { marginType: 'PERCENT', value: 0.3 },
  },
};

export function roundVnd(amount: number, step: number): number {
  if (step <= 0) return Math.round(amount);
  return Math.round(amount / step) * step;
}

export function computeMarginPrice(
  providerCost: number,
  rule: ServiceMarginRule,
  roundTo: number,
): number {
  const raw =
    rule.marginType === 'PERCENT'
      ? providerCost * (1 + rule.value / 100)
      : providerCost + rule.value;
  return roundVnd(raw, roundTo);
}

/** Preview before final rounding — rounded to 1đ for admin calculator. */
export function computePreviewPrice(providerCost: number, rule: ServiceMarginRule): number {
  const raw =
    rule.marginType === 'PERCENT'
      ? providerCost * (1 + rule.value / 100)
      : providerCost + rule.value;
  return Math.round(raw);
}

export function formatMarginRuleLabel(groupLabel: string, rule: ServiceMarginRule): string {
  if (rule.marginType === 'PERCENT') {
    return `${groupLabel}: +${rule.value}%`;
  }
  return `${groupLabel}: +${rule.value.toLocaleString('vi-VN')}đ`;
}

export function normalizeMarginRule(
  raw: Record<string, unknown> | undefined,
  fallback: ServiceMarginRule,
): ServiceMarginRule {
  if (!raw || typeof raw !== 'object') return fallback;

  if (raw.marginType === 'PERCENT' || raw.marginType === 'FIXED') {
    return {
      marginType: raw.marginType,
      value: Number(raw.value ?? fallback.value),
    };
  }

  const legacyPercent = Number(raw.marginPercent ?? 0);
  const legacyFixed = Number(raw.marginFixed ?? 0);
  if (legacyFixed > 0 && legacyPercent === 0) {
    return { marginType: 'FIXED', value: legacyFixed };
  }
  if (legacyPercent > 0) {
    return { marginType: 'PERCENT', value: legacyPercent };
  }
  return fallback;
}
