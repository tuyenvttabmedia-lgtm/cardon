import { describe, expect, it } from 'vitest';
import type { EsimPreviewOffer } from '@/lib/esim-offers';
import {
  esimOfferPath,
  esimOfferSeoTitle,
  findEsimOfferBySlug,
} from '@/lib/esim-seo';

function offer(partial: Partial<EsimPreviewOffer> & Pick<EsimPreviewOffer, 'id'>): EsimPreviewOffer {
  return {
    variantId: 'v1',
    productId: 'p1',
    productSlug: 'esim-han-quoc',
    productName: 'eSIM Hàn Quốc',
    sku: 'SKU',
    title: 'Hàn Quốc 2GB',
    providerDescription: '',
    summary: '',
    dataLabel: '2 GB',
    durationLabel: '15 ngày',
    speedLabel: '4G',
    operators: [],
    groupLabel: 'Standard Fixed',
    sellPriceVnd: 99000,
    countryIso: 'KR',
    countryName: 'Hàn Quốc',
    testData: false,
    ...partial,
  };
}

describe('esim-seo', () => {
  it('resolves SEO slug and legacy Airalo slug', () => {
    const row = offer({ id: 'han-quoc-2gb-15-ngay', legacyId: 'kr-jang-15days-2gb' });
    expect(findEsimOfferBySlug([row], 'han-quoc-2gb-15-ngay')).toEqual({
      offer: row,
      viaLegacy: false,
    });
    expect(findEsimOfferBySlug([row], 'kr-jang-15days-2gb')).toEqual({
      offer: row,
      viaLegacy: true,
    });
    expect(esimOfferPath(row)).toBe('/esim/han-quoc-2gb-15-ngay');
    expect(esimOfferSeoTitle(row, 'vi')).toContain('Hàn Quốc');
  });
});
