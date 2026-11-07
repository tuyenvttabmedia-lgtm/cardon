import { activationLabelVi } from './esim-catalogue.rules';

export const CATALOGUE_CURRENT_NOTICE =
  'Thông số theo catalogue hiện tại, có thể khác lúc mua.';
export const CATALOGUE_MISSING_NOTICE =
  'Catalogue hiện không còn gói này. Thông số lúc mua có thể khác.';

export interface EsimPackageSpec {
  title: string | null;
  dataAllowanceLabel: string | null;
  validityLabel: string | null;
  activationLabel: string | null;
  fupClear: boolean | null;
  fairUsagePolicy: string | null;
  catalogueLifecycle: string | null;
  specSource: 'catalogue_current';
  notice: string;
}

export interface EsimCataloguePackageRow {
  title: string;
  dataAmountMb: number;
  isUnlimited: boolean;
  validityDays: number;
  fupClear: boolean;
  lifecycle: string;
  rawSafeMeta?: unknown;
  variant?: { name?: string | null; metadata?: unknown } | null;
}

export function formatCatalogueDataLabel(amountMb: number, unlimited: boolean): string {
  if (unlimited || amountMb < 0) return 'Không giới hạn';
  if (amountMb >= 1024 && amountMb % 1024 === 0) return `${amountMb / 1024} GB`;
  if (amountMb >= 1000 && amountMb % 1000 === 0) return `${amountMb / 1000} GB`;
  return `${amountMb} MB`;
}

export function formatCatalogueDurationLabel(duration: number, unit = 'day'): string {
  if (unit === 'day') return `${duration} ngày`;
  return `${duration} ${unit}`.trim();
}

export function emptyEsimPackageSpec(fallbackTitle?: string | null): EsimPackageSpec {
  return {
    title: fallbackTitle?.trim() || null,
    dataAllowanceLabel: null,
    validityLabel: null,
    activationLabel: null,
    fupClear: null,
    fairUsagePolicy: null,
    catalogueLifecycle: null,
    specSource: 'catalogue_current',
    notice: CATALOGUE_MISSING_NOTICE,
  };
}

export function buildEsimPackageSpec(
  row: EsimCataloguePackageRow | null | undefined,
  fallbackTitle?: string | null,
): EsimPackageSpec {
  if (!row) return emptyEsimPackageSpec(fallbackTitle);
  const catalogue = readVariantCatalogue(row.variant?.metadata);
  const meta = asRecord(row.rawSafeMeta);
  const activationPolicy =
    readString(catalogue?.activationPolicy) || readString(meta?.activationPolicy);
  const fairUsagePolicy = hideSupplierBrand(
    readString(catalogue?.fairUsagePolicy) || readString(meta?.fairUsagePolicy),
  );
  return {
    title: row.title.trim() || fallbackTitle?.trim() || row.variant?.name?.trim() || null,
    dataAllowanceLabel: formatCatalogueDataLabel(row.dataAmountMb, row.isUnlimited),
    validityLabel: formatCatalogueDurationLabel(row.validityDays, 'day'),
    activationLabel: activationPolicy ? activationLabelVi(activationPolicy) : activationLabelVi(''),
    fupClear: row.fupClear,
    fairUsagePolicy: fairUsagePolicy || null,
    catalogueLifecycle: row.lifecycle || null,
    specSource: 'catalogue_current',
    notice: CATALOGUE_CURRENT_NOTICE,
  };
}

function readVariantCatalogue(metadata: unknown): Record<string, unknown> | null {
  const root = asRecord(metadata);
  return asRecord(root?.catalogue);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function hideSupplierBrand(value: string): string {
  return value.replace(/Airalo/gi, 'Keyon');
}
