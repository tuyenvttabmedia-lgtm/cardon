export type MarginType = 'PERCENT' | 'FIXED';

export type ServiceMarginRule = {
  marginType: MarginType;
  value: number;
};

export function computePreviewPrice(providerCost: number, rule: ServiceMarginRule): number {
  const raw =
    rule.marginType === 'PERCENT'
      ? providerCost * (1 + rule.value / 100)
      : providerCost + rule.value;
  return Math.round(raw);
}

export function computeAppliedPrice(
  providerCost: number,
  rule: ServiceMarginRule,
  roundTo: number,
): number {
  const raw =
    rule.marginType === 'PERCENT'
      ? providerCost * (1 + rule.value / 100)
      : providerCost + rule.value;
  if (roundTo <= 0) return Math.round(raw);
  return Math.round(raw / roundTo) * roundTo;
}

export function formatMarginDisplay(rule: ServiceMarginRule): string {
  if (rule.marginType === 'PERCENT') return `${rule.value}%`;
  return `${rule.value.toLocaleString('vi-VN')}đ`;
}
