import {
  assignEsimSeoSlugs,
  buildEsimOfferSeoBase,
  dataSeoSegment,
  destinationSeoSegment,
  durationSeoSegment,
  legacyDisambiguator,
} from './esim-offer-seo';

describe('esim-offer-seo', () => {
  it('builds Vietnamese destination + data + duration segments', () => {
    expect(destinationSeoSegment('kr', 'KR')).toBe('han-quoc');
    expect(dataSeoSegment({ dataAmountMb: 2048 })).toBe('2gb');
    expect(dataSeoSegment({ unlimited: true })).toBe('khong-gioi-han');
    expect(durationSeoSegment({ duration: 15, durationUnit: 'day' })).toBe('15-ngay');
    expect(
      buildEsimOfferSeoBase({
        destinationKey: 'kr',
        countryIso: 'KR',
        dataAmountMb: 2048,
        duration: 15,
        durationUnit: 'day',
      }),
    ).toBe('han-quoc-2gb-15-ngay');
  });

  it('disambiguates colliding SEO bases with a stable provider token', () => {
    const map = assignEsimSeoSlugs([
      { publicSlug: 'kr-jang-15days-2gb', base: 'han-quoc-2gb-15-ngay' },
      { publicSlug: 'kr-other-15days-2gb', base: 'han-quoc-2gb-15-ngay' },
    ]);
    expect(map.get('kr-jang-15days-2gb')).toBe('han-quoc-2gb-15-ngay');
    expect(map.get('kr-other-15days-2gb')).toBe('han-quoc-2gb-15-ngay-other');
    expect(legacyDisambiguator('kr-jang-15days-2gb')).toBe('jang');
  });
});
