import type { ProductVariant } from '@/types/api';
import { formatVnd } from '@/lib/utils';

export type DataVariantMetadata = {
  packageName?: string;
  capacity?: string;
  duration?: string;
};

export function parseDataVariantMetadata(
  metadata?: Record<string, unknown> | null,
): DataVariantMetadata {
  if (!metadata || typeof metadata !== 'object') return {};
  return {
    packageName: typeof metadata.packageName === 'string' ? metadata.packageName : undefined,
    capacity: typeof metadata.capacity === 'string' ? metadata.capacity : undefined,
    duration: typeof metadata.duration === 'string' ? metadata.duration : undefined,
  };
}

function formatDurationLabel(duration: string): string {
  const trimmed = duration.trim();
  if (!trimmed) return '';
  return /ngày/i.test(trimmed) ? trimmed : `${trimmed} ngày`;
}

export function formatDataPackageCard(variant: ProductVariant): {
  packageName: string;
  quotaLabel: string;
  faceValueLabel: string;
  sellPriceLabel: string;
} {
  const meta = parseDataVariantMetadata(variant.metadata ?? null);
  const packageName = meta.packageName || variant.name || variant.sku;
  const capacity = meta.capacity?.trim() ?? '';
  const duration = meta.duration ? formatDurationLabel(meta.duration) : '';
  const quotaLabel =
    capacity && duration ? `${capacity} / ${duration}` : capacity || duration || variant.name;
  return {
    packageName,
    quotaLabel,
    faceValueLabel: formatVnd(parseFloat(variant.faceValue)),
    sellPriceLabel: formatVnd(parseFloat(variant.sellPrice)),
  };
}
