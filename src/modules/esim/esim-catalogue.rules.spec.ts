import {
  classifyValidityBucket,
  costVndFromAiralo,
  destPhotoPath,
  detectFupClear,
  activationLabelVi,
  displayProviderText,
  presentStorefrontOfferText,
  inferDestinationKey,
  lifecycleForImportedRow,
  parseDataAmountMb,
  PUBLISH_COUNTRY_ISOS,
  selectPublishablePackages,
  sellPriceFromAiralo,
  sellPriceFromCostVnd,
} from './esim-catalogue.rules';

describe('esim-catalogue.rules', () => {
  it('prefers Airalo VND net price and sells at recommended retail when present', () => {
    const cost = costVndFromAiralo({ netPriceVnd: 95_400, netPriceUsd: 3.5, usdVndRate: 26_000 });
    expect(cost).toEqual({ costVnd: 95_400, costCurrency: 'VND', costAmount: 95_400 });
    expect(sellPriceFromCostVnd(cost.costVnd)).toBe(125_000);
    expect(sellPriceFromAiralo(cost.costVnd, 169_000)).toBe(169_000);
    expect(sellPriceFromAiralo(cost.costVnd, 110_000)).toBe(110_000);
    expect(sellPriceFromAiralo(cost.costVnd, 0)).toBe(125_000);
  });

  it('falls back to USD × admin rate when VND is missing', () => {
    const cost = costVndFromAiralo({ netPriceVnd: null, netPriceUsd: 4.2, usdVndRate: 26_000 });
    expect(cost.costCurrency).toBe('USD');
    expect(cost.costVnd).toBe(109_200);
    expect(sellPriceFromCostVnd(cost.costVnd)).toBe(142_000);
  });

  it('classifies validity buckets used for 6–8 packs', () => {
    expect(classifyValidityBucket(3)).toBe('short');
    expect(classifyValidityBucket(7)).toBe('standard');
    expect(classifyValidityBucket(12)).toBe('long');
    expect(classifyValidityBucket(30)).toBe('month');
  });

  it('requires FUP text before allowing unlimited', () => {
    expect(detectFupClear('Unlimited with fair usage policy after 1GB')).toBe(true);
    expect(detectFupClear('Unlimited data')).toBe(false);
  });

  it('parses Airalo data amount from display string', () => {
    expect(parseDataAmountMb(1024, '1 GB', false)).toBe(1024);
    expect(parseDataAmountMb(500, '500 MB', false)).toBe(500);
    expect(parseDataAmountMb(1024, null, false)).toBe(1024);
    expect(parseDataAmountMb(1, null, true)).toBe(-1);
  });

  it('translates Airalo activation policy for the storefront', () => {
    expect(activationLabelVi('first-usage')).toContain('kết nối mạng lần đầu');
    expect(activationLabelVi('on-installation')).toContain('khi cài eSIM');
  });

  it('keeps Vietnamese catalogue labels and emits English display labels without rewriting the plan code', () => {
    const shared = {
      destinationKey: 'jp',
      countryIso: 'JP',
      storedCountryName: 'Nhật Bản',
      dataAmountMb: 1024,
      unlimited: false,
      duration: 7,
      durationUnit: 'day',
      speedLabel: '5G',
      operators: ['NTT'],
      activationPolicy: 'first-usage',
      storedActivationLabel: 'Bắt đầu tính ngày khi eSIM kết nối mạng lần đầu tại điểm đến',
      title: 'Nhật Bản — JP-1GB-7D - 7 ngày',
      productName: 'eSIM Nhật Bản',
      providerDescription: '1 GB - 7 ngày',
    };
    const vi = presentStorefrontOfferText({ ...shared, locale: 'vi' });
    expect(vi.countryName).toBe('Nhật Bản');
    expect(vi.dataLabel).toBe('1 GB');
    expect(vi.durationLabel).toBe('7 ngày');
    expect(vi.activationLabel).toContain('kết nối mạng lần đầu');
    expect(vi.summary).toContain('Tốc độ: 5G.');
    expect(vi.summary).toContain('Nhà mạng: NTT.');
    expect(vi.title).toBe('Nhật Bản — JP-1GB-7D - 7 ngày');

    const en = presentStorefrontOfferText({ ...shared, locale: 'en', unlimited: true, dataAmountMb: -1 });
    expect(en.countryName).toBe('Japan');
    expect(en.dataLabel).toBe('Unlimited');
    expect(en.durationLabel).toBe('7 days');
    expect(en.activationLabel).toBe('The plan starts when the eSIM first connects at the destination');
    expect(en.summary).toContain('Speed: 5G.');
    expect(en.summary).toContain('Network: NTT.');
    expect(en.title).toBe('Japan — JP-1GB-7D - 7 days');
    expect(en.productName).toBe('eSIM Japan');
    expect(en.title).toContain('JP-1GB-7D');
    expect(en.summary).toContain('1 GB - 7 days');
    expect(vi.summary).toContain('1 GB - 7 ngày');
    expect(displayProviderText('Phủ sóng toàn bộ Nhật Bản.', 'en')).toBe('');
    expect(displayProviderText('Phủ sóng toàn bộ Nhật Bản.', 'vi')).toBe('Phủ sóng toàn bộ Nhật Bản.');
    expect(displayProviderText('1 GB - 7 ngày', 'en')).toBe('1 GB - 7 days');
  });

  it('maps multi-country Asia packs to the asia destination', () => {
    expect(
      inferDestinationKey({
        countryIso: '',
        countries: ['JP', 'KR', 'TH', 'SG', 'MY'],
        packageType: 'global',
        title: 'Asia 5GB 7 Days',
      }),
    ).toBe('asia');
  });

  it('assigns lifecycle IMPORTED → MAPPED / REVIEW / PUBLISHED', () => {
    expect(
      lifecycleForImportedRow({ mapped: false, costVnd: 0, sellPriceVnd: 0, selectedForPublish: false }),
    ).toBe('IMPORTED');
    expect(
      lifecycleForImportedRow({ mapped: true, costVnd: 0, sellPriceVnd: 0, selectedForPublish: true }),
    ).toBe('REVIEW_REQUIRED');
    expect(
      lifecycleForImportedRow({ mapped: true, costVnd: 1000, sellPriceVnd: 2000, selectedForPublish: false }),
    ).toBe('MAPPED');
    expect(
      lifecycleForImportedRow({ mapped: true, costVnd: 1000, sellPriceVnd: 2000, selectedForPublish: true }),
    ).toBe('PUBLISHED');
  });

  it('picks 6–8 packs per allowed destination and skips unclear unlimited', () => {
    const jp = [
      pack('jp', 3, 1024, false, false),
      pack('jp', 7, 1024, false, false),
      pack('jp', 15, 2048, false, false),
      pack('jp', 30, 3072, false, false),
      pack('jp', 30, 10240, false, false),
      pack('jp', 7, -1, true, true),
      pack('jp', 3, -1, true, true),
      pack('jp', 7, -1, true, false),
    ];
    const vn = [pack('vn', 7, 1024, false, false)];
    const selected = selectPublishablePackages([...jp, ...vn]);
    expect(selected.length).toBeGreaterThanOrEqual(6);
    expect(selected.length).toBeLessThanOrEqual(8);
    expect(selected.every((row) => row.destinationKey === 'jp')).toBe(true);
    expect(selected.some((row) => row.isUnlimited && row.fupClear)).toBe(true);
    expect(selected.some((row) => row.isUnlimited && !row.fupClear)).toBe(false);
  });
});

function pack(
  destinationKey: string,
  validityDays: number,
  dataAmountMb: number,
  isUnlimited: boolean,
  fupClear: boolean,
) {
  return {
    destinationKey,
    validityDays,
    dataAmountMb,
    isUnlimited,
    fupClear,
    packageType: 'sim',
  };
}

describe('destPhotoPath', () => {
  it('gives each published country its own landmark file', () => {
    const paths = PUBLISH_COUNTRY_ISOS.map((iso) => destPhotoPath(iso));
    expect(new Set(paths).size).toBe(PUBLISH_COUNTRY_ISOS.length);
    expect(destPhotoPath('ASIA')).toBe('/images/esim/dest/asia.jpg');
    expect(destPhotoPath('europe')).toBe('/images/esim/dest/europe.jpg');
    expect(destPhotoPath('JP')).not.toBe(destPhotoPath('KR'));
    expect(destPhotoPath('TH')).not.toBe(destPhotoPath('SG'));
  });
});
