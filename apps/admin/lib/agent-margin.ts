export type MarginType = 'PERCENT' | 'FIXED';

export type ServiceMarginRule = {
  marginType: MarginType;
  value: number;
};

/**
 * Face-based CardOn margin:
 * PERCENT → cost + face × %/100
 * FIXED → cost + VND
 * Clamped to [cost, face].
 */
export function computePreviewPrice(
  providerCost: number,
  faceValue: number,
  rule: ServiceMarginRule,
): number {
  const face = faceValue > 0 ? faceValue : providerCost;
  const cardonTake =
    rule.marginType === 'PERCENT' ? face * (rule.value / 100) : rule.value;
  let raw = providerCost + cardonTake;
  if (raw < providerCost) raw = providerCost;
  if (raw > face) raw = face;
  return Math.round(raw);
}

export function computeAppliedPrice(
  providerCost: number,
  faceValue: number,
  rule: ServiceMarginRule,
  roundTo: number,
): number {
  const face = faceValue > 0 ? faceValue : providerCost;
  const cardonTake =
    rule.marginType === 'PERCENT' ? face * (rule.value / 100) : rule.value;
  let raw = providerCost + cardonTake;
  if (raw < providerCost) raw = providerCost;
  if (raw > face) raw = face;
  if (roundTo <= 0) return Math.round(raw);
  return Math.round(raw / roundTo) * roundTo;
}

export function formatMarginDisplay(rule: ServiceMarginRule): string {
  if (rule.marginType === 'PERCENT') return `${rule.value}% mệnh giá`;
  return `${rule.value.toLocaleString('vi-VN')}đ`;
}
