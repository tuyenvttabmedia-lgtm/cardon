import { EsimCatalogLifecycle } from '@prisma/client';
import {
  CATALOGUE_CURRENT_NOTICE,
  CATALOGUE_MISSING_NOTICE,
  buildEsimPackageSpec,
  formatCatalogueDataLabel,
  formatCatalogueDurationLabel,
} from './esim-package-spec';

describe('eSIM package spec from current catalogue', () => {
  it('fills published and inactive rows without inventing remaining data or expiry', () => {
    const published = buildEsimPackageSpec({
      title: 'Korea 3GB',
      dataAmountMb: 3072,
      isUnlimited: false,
      validityDays: 7,
      fupClear: true,
      lifecycle: EsimCatalogLifecycle.PUBLISHED,
      rawSafeMeta: { activationPolicy: 'first-usage' },
      variant: {
        name: 'Hàn Quốc 3GB',
        metadata: { catalogue: { fairUsagePolicy: 'Airalo fair use 1GB/day' } },
      },
    });
    expect(published.specSource).toBe('catalogue_current');
    expect(published.title).toBe('Korea 3GB');
    expect(published.dataAllowanceLabel).toBe('3 GB');
    expect(published.validityLabel).toBe('7 ngày');
    expect(published.activationLabel).toMatch(/kết nối mạng lần đầu/);
    expect(published.fairUsagePolicy).toBe('Keyon fair use 1GB/day');
    expect(published.catalogueLifecycle).toBe('PUBLISHED');
    expect(published.notice).toBe(CATALOGUE_CURRENT_NOTICE);
    expect(JSON.stringify(published)).not.toMatch(/remaining|expiry|created_at/i);

    const inactive = buildEsimPackageSpec({
      title: 'Korea 1GB',
      dataAmountMb: 1024,
      isUnlimited: false,
      validityDays: 5,
      fupClear: true,
      lifecycle: EsimCatalogLifecycle.INACTIVE,
    });
    expect(inactive.catalogueLifecycle).toBe('INACTIVE');
    expect(inactive.dataAllowanceLabel).toBe('1 GB');
    expect(inactive.notice).toBe(CATALOGUE_CURRENT_NOTICE);
  });

  it('falls back when the catalogue row is missing', () => {
    const missing = buildEsimPackageSpec(null, 'Gói cũ');
    expect(missing.title).toBe('Gói cũ');
    expect(missing.dataAllowanceLabel).toBeNull();
    expect(missing.validityLabel).toBeNull();
    expect(missing.activationLabel).toBeNull();
    expect(missing.catalogueLifecycle).toBeNull();
    expect(missing.notice).toBe(CATALOGUE_MISSING_NOTICE);
    expect(missing.specSource).toBe('catalogue_current');
  });

  it('labels unlimited, megabytes, and day units from catalogue fields only', () => {
    expect(formatCatalogueDataLabel(0, true)).toBe('Không giới hạn');
    expect(formatCatalogueDataLabel(500, false)).toBe('500 MB');
    expect(formatCatalogueDataLabel(2000, false)).toBe('2 GB');
    expect(formatCatalogueDurationLabel(15, 'day')).toBe('15 ngày');
    const unlimited = buildEsimPackageSpec({
      title: 'Unlimited Asia',
      dataAmountMb: 0,
      isUnlimited: true,
      validityDays: 10,
      fupClear: true,
      lifecycle: EsimCatalogLifecycle.PUBLISHED,
    });
    expect(unlimited.dataAllowanceLabel).toBe('Không giới hạn');
  });
});
