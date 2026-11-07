/** Airalo catalogue lifecycle and localhost publish rules. No provider HTTP. */

export const ESIM_CATALOG_LIFECYCLES = [
  'IMPORTED',
  'MAPPED',
  'REVIEW_REQUIRED',
  'PUBLISHED',
  'INACTIVE',
] as const;

export type EsimCatalogLifecycleName = (typeof ESIM_CATALOG_LIFECYCLES)[number];

export const AIRALO_SELL_MARKUP = 1.3;
export const DEFAULT_USD_VND_RATE = 26_000;

export const PUBLISH_COUNTRY_ISOS = [
  'JP',
  'KR',
  'TH',
  'CN',
  'TW',
  'SG',
  'MY',
  'ID',
  'PH',
  'HK',
  'AU',
  'US',
  'IN',
  'KH',
  'GB',
  'FR',
  'DE',
  'IT',
  'ES',
  'CA',
  'NZ',
  'AE',
  'TR',
  'NL',
  'CH',
  'AT',
  'PT',
  'GR',
  'MV',
  'EG',
  'MX',
  'LA',
  'MO',
  'BE',
  'IE',
  'CZ',
  'QA',
] as const;

export const PUBLISH_REGION_KEYS = ['asia', 'europe'] as const;

export const COUNTRY_SLUGS: Record<string, string> = {
  JP: 'esim-nhat-ban',
  KR: 'esim-han-quoc',
  TH: 'esim-thai-lan',
  CN: 'esim-trung-quoc',
  TW: 'esim-dai-loan',
  SG: 'esim-singapore',
  MY: 'esim-malaysia',
  ID: 'esim-indonesia',
  PH: 'esim-philippines',
  HK: 'esim-hong-kong',
  AU: 'esim-uc',
  US: 'esim-my',
  IN: 'esim-an-do',
  KH: 'esim-campuchia',
  GB: 'esim-anh',
  FR: 'esim-phap',
  DE: 'esim-duc',
  IT: 'esim-italy',
  ES: 'esim-tay-ban-nha',
  CA: 'esim-canada',
  NZ: 'esim-new-zealand',
  AE: 'esim-uae',
  TR: 'esim-tho-nhi-ky',
  LA: 'esim-lao',
  MO: 'esim-macao',
  NL: 'esim-ha-lan',
  CH: 'esim-thuy-si',
  AT: 'esim-ao',
  PT: 'esim-bo-dao-nha',
  GR: 'esim-hy-lap',
  MV: 'esim-maldives',
  EG: 'esim-ai-cap',
  MX: 'esim-mexico',
  BE: 'esim-bi',
  IE: 'esim-ireland',
  CZ: 'esim-sec',
  QA: 'esim-qatar',
};

export const REGION_SLUGS = {
  asia: 'esim-chau-a',
  europe: 'esim-chau-au',
} as const;

/** Local landmark photos — one unique file per destination. */
export const DEST_PHOTO_BY_KEY: Record<string, string> = {
  JP: '/images/esim/dest/jp.jpg',
  jp: '/images/esim/dest/jp.jpg',
  KR: '/images/esim/dest/kr.jpg',
  kr: '/images/esim/dest/kr.jpg',
  TH: '/images/esim/dest/th.jpg',
  th: '/images/esim/dest/th.jpg',
  CN: '/images/esim/dest/cn.jpg',
  cn: '/images/esim/dest/cn.jpg',
  TW: '/images/esim/dest/tw.jpg',
  tw: '/images/esim/dest/tw.jpg',
  SG: '/images/esim/dest/sg.jpg',
  sg: '/images/esim/dest/sg.jpg',
  MY: '/images/esim/dest/my.jpg',
  my: '/images/esim/dest/my.jpg',
  ID: '/images/esim/dest/id.jpg',
  id: '/images/esim/dest/id.jpg',
  PH: '/images/esim/dest/ph.jpg',
  ph: '/images/esim/dest/ph.jpg',
  HK: '/images/esim/dest/hk.jpg',
  hk: '/images/esim/dest/hk.jpg',
  AU: '/images/esim/dest/au.jpg',
  au: '/images/esim/dest/au.jpg',
  US: '/images/esim/dest/us.jpg',
  us: '/images/esim/dest/us.jpg',
  IN: '/images/esim/dest/in.jpg',
  in: '/images/esim/dest/in.jpg',
  KH: '/images/esim/dest/kh.jpg',
  kh: '/images/esim/dest/kh.jpg',
  GB: '/images/esim/dest/gb.jpg',
  gb: '/images/esim/dest/gb.jpg',
  FR: '/images/esim/dest/fr.jpg',
  fr: '/images/esim/dest/fr.jpg',
  DE: '/images/esim/dest/de.jpg',
  de: '/images/esim/dest/de.jpg',
  IT: '/images/esim/dest/it.jpg',
  it: '/images/esim/dest/it.jpg',
  ES: '/images/esim/dest/es.jpg',
  es: '/images/esim/dest/es.jpg',
  CA: '/images/esim/dest/ca.jpg',
  ca: '/images/esim/dest/ca.jpg',
  NZ: '/images/esim/dest/nz.jpg',
  nz: '/images/esim/dest/nz.jpg',
  AE: '/images/esim/dest/ae.jpg',
  ae: '/images/esim/dest/ae.jpg',
  TR: '/images/esim/dest/tr.jpg',
  tr: '/images/esim/dest/tr.jpg',
  LA: '/images/esim/dest/la.jpg',
  la: '/images/esim/dest/la.jpg',
  MO: '/images/esim/dest/mo.jpg',
  mo: '/images/esim/dest/mo.jpg',
  NL: '/images/esim/dest/nl.jpg',
  nl: '/images/esim/dest/nl.jpg',
  CH: '/images/esim/dest/ch.jpg',
  ch: '/images/esim/dest/ch.jpg',
  AT: '/images/esim/dest/at.jpg',
  at: '/images/esim/dest/at.jpg',
  PT: '/images/esim/dest/pt.jpg',
  pt: '/images/esim/dest/pt.jpg',
  GR: '/images/esim/dest/gr.jpg',
  gr: '/images/esim/dest/gr.jpg',
  MV: '/images/esim/dest/mv.jpg',
  mv: '/images/esim/dest/mv.jpg',
  EG: '/images/esim/dest/eg.jpg',
  eg: '/images/esim/dest/eg.jpg',
  MX: '/images/esim/dest/mx.jpg',
  mx: '/images/esim/dest/mx.jpg',
  BE: '/images/esim/dest/be.jpg',
  be: '/images/esim/dest/be.jpg',
  IE: '/images/esim/dest/ie.jpg',
  ie: '/images/esim/dest/ie.jpg',
  CZ: '/images/esim/dest/cz.jpg',
  cz: '/images/esim/dest/cz.jpg',
  QA: '/images/esim/dest/qa.jpg',
  qa: '/images/esim/dest/qa.jpg',
  ASIA: '/images/esim/dest/asia.jpg',
  asia: '/images/esim/dest/asia.jpg',
  EUROPE: '/images/esim/dest/europe.jpg',
  europe: '/images/esim/dest/europe.jpg',
};

export function destPhotoPath(isoOrKey: string, fallback = '/images/esim/dest/asia.jpg'): string {
  const key = isoOrKey.trim();
  return DEST_PHOTO_BY_KEY[key] ?? DEST_PHOTO_BY_KEY[key.toUpperCase()] ?? DEST_PHOTO_BY_KEY[key.toLowerCase()] ?? fallback;
}

export const COUNTRY_NAMES_VI: Record<string, string> = {
  jp: 'Nhật Bản',
  JP: 'Nhật Bản',
  KR: 'Hàn Quốc',
  TH: 'Thái Lan',
  CN: 'Trung Quốc',
  TW: 'Đài Loan',
  SG: 'Singapore',
  MY: 'Malaysia',
  ID: 'Indonesia',
  PH: 'Philippines',
  HK: 'Hồng Kông',
  AU: 'Úc',
  US: 'Mỹ',
  IN: 'Ấn Độ',
  KH: 'Campuchia',
  GB: 'Anh',
  FR: 'Pháp',
  DE: 'Đức',
  IT: 'Italy',
  ES: 'Tây Ban Nha',
  CA: 'Canada',
  NZ: 'New Zealand',
  AE: 'UAE',
  ae: 'UAE',
  TR: 'Thổ Nhĩ Kỳ',
  tr: 'Thổ Nhĩ Kỳ',
  LA: 'Lào',
  la: 'Lào',
  MO: 'Macao',
  mo: 'Macao',
  NL: 'Hà Lan',
  nl: 'Hà Lan',
  CH: 'Thụy Sĩ',
  ch: 'Thụy Sĩ',
  AT: 'Áo',
  at: 'Áo',
  PT: 'Bồ Đào Nha',
  pt: 'Bồ Đào Nha',
  GR: 'Hy Lạp',
  gr: 'Hy Lạp',
  MV: 'Maldives',
  mv: 'Maldives',
  EG: 'Ai Cập',
  eg: 'Ai Cập',
  MX: 'Mexico',
  mx: 'Mexico',
  BE: 'Bỉ',
  be: 'Bỉ',
  IE: 'Ireland',
  ie: 'Ireland',
  CZ: 'Séc',
  cz: 'Séc',
  QA: 'Qatar',
  qa: 'Qatar',
  asia: 'Châu Á',
  europe: 'Châu Âu',
};

const ASIA_ISOS = new Set([
  'JP',
  'KR',
  'TH',
  'CN',
  'TW',
  'SG',
  'MY',
  'ID',
  'PH',
  'HK',
  'IN',
  'KH',
  'VN',
  'LA',
  'MM',
  'BN',
  'MO',
  'BD',
  'NP',
  'LK',
]);

const EUROPE_ISOS = new Set([
  'GB',
  'FR',
  'DE',
  'IT',
  'ES',
  'NL',
  'BE',
  'AT',
  'CH',
  'PT',
  'IE',
  'SE',
  'NO',
  'DK',
  'FI',
  'PL',
  'CZ',
  'GR',
  'HU',
  'RO',
  'BG',
  'HR',
  'SK',
  'SI',
  'LT',
  'LV',
  'EE',
  'LU',
  'MT',
  'CY',
]);

export function countryNameVi(key: string): string {
  return COUNTRY_NAMES_VI[key] ?? COUNTRY_NAMES_VI[key.toUpperCase()] ?? COUNTRY_NAMES_VI[key.toLowerCase()] ?? key;
}

export function sellPriceFromCostVnd(costVnd: number): number {
  if (!Number.isFinite(costVnd) || costVnd <= 0) return 0;
  return Math.ceil((costVnd * AIRALO_SELL_MARKUP) / 1000) * 1000;
}

/** Sell at Airalo recommended retail when present. Fallback +30% only if RRP is missing. */
export function sellPriceFromAiralo(costVnd: number, retailVnd?: number | null): number {
  const retail = Number(retailVnd);
  if (Number.isFinite(retail) && retail > 0) {
    return Math.ceil(retail / 1000) * 1000;
  }
  return sellPriceFromCostVnd(costVnd);
}

export function retailVndFromAiralo(input: {
  retailPriceVnd?: number | null;
  retailPriceUsd?: number | null;
  usdVndRate: number;
}): number {
  const vnd = Number(input.retailPriceVnd);
  if (Number.isFinite(vnd) && vnd > 0) return Math.round(vnd);
  const usd = Number(input.retailPriceUsd);
  const rate = Number(input.usdVndRate);
  if (Number.isFinite(usd) && usd > 0 && Number.isFinite(rate) && rate > 0) {
    return Math.round(usd * rate);
  }
  return 0;
}

export function costVndFromAiralo(input: {
  netPriceVnd?: number | null;
  netPriceUsd?: number | null;
  usdVndRate: number;
}): { costVnd: number; costCurrency: 'VND' | 'USD'; costAmount: number } {
  const vnd = Number(input.netPriceVnd);
  if (Number.isFinite(vnd) && vnd > 0) {
    return { costVnd: Math.round(vnd), costCurrency: 'VND', costAmount: vnd };
  }
  const usd = Number(input.netPriceUsd);
  const rate = Number(input.usdVndRate);
  if (Number.isFinite(usd) && usd > 0 && Number.isFinite(rate) && rate > 0) {
    return { costVnd: Math.round(usd * rate), costCurrency: 'USD', costAmount: usd };
  }
  return { costVnd: 0, costCurrency: 'USD', costAmount: 0 };
}

export function classifyValidityBucket(days: number): 'short' | 'standard' | 'long' | 'month' | 'other' {
  if (days >= 1 && days <= 5) return 'short';
  if (days >= 6 && days <= 8) return 'standard';
  if (days >= 10 && days <= 16) return 'long';
  if (days >= 20 && days <= 31) return 'month';
  return 'other';
}

export function detectFupClear(text: string): boolean {
  return /fair usage|fup|throttl|reduced speed|giới hạn tốc|chính sách công bằng|speed after|after high-speed/i.test(
    text,
  );
}

export function parseDataAmountMb(amount: unknown, data: unknown, isUnlimited: boolean): number {
  if (isUnlimited) return -1;
  const dataStr = String(data ?? '');
  const mbMatch = dataStr.match(/([\d.]+)\s*mb/i);
  if (mbMatch) return Math.round(Number(mbMatch[1]));
  const gbMatch = dataStr.match(/([\d.]+)\s*gb/i);
  if (gbMatch) return Math.round(Number(gbMatch[1]) * 1024);
  const n = Number(amount);
  // Airalo v2 `amount` is megabytes.
  if (Number.isFinite(n) && n > 0) return Math.round(n);
  return 0;
}

export function activationLabelVi(policy: string): string {
  const value = policy.trim().toLowerCase();
  if (!value) return 'Theo hướng dẫn kèm mã cài';
  if (/first[-_ ]?us|on[-_ ]?usage|network|arriv|connect/.test(value)) {
    return 'Bắt đầu tính ngày khi eSIM kết nối mạng lần đầu tại điểm đến';
  }
  if (/install/.test(value)) {
    return 'Bắt đầu tính ngày ngay khi cài eSIM lên máy';
  }
  return policy.trim();
}

export function inferDestinationKey(input: {
  countryIso: string;
  countries: string[];
  packageType: string;
  title: string;
}): string {
  const iso = input.countryIso.trim().toUpperCase();
  const countries = input.countries.map((code) => code.trim().toUpperCase()).filter(Boolean);
  const isRegional =
    countries.length > 1 ||
    input.packageType === 'global' ||
    /asia|europe|châu á|châu âu|regional/i.test(input.title);
  if (isRegional) {
    if (majorityIn(countries, ASIA_ISOS) || /asia|châu á/i.test(input.title)) return 'asia';
    if (majorityIn(countries, EUROPE_ISOS) || /europe|châu âu/i.test(input.title)) return 'europe';
  }
  if (iso) return iso.toLowerCase();
  return countries[0]?.toLowerCase() ?? 'unknown';
}

function majorityIn(codes: string[], set: Set<string>): boolean {
  if (codes.length === 0) return false;
  const hits = codes.filter((code) => set.has(code)).length;
  return hits / codes.length >= 0.6;
}

export function isPublishDestination(destinationKey: string): boolean {
  const key = destinationKey.trim().toLowerCase();
  if ((PUBLISH_REGION_KEYS as readonly string[]).includes(key)) return true;
  return (PUBLISH_COUNTRY_ISOS as readonly string[]).includes(key.toUpperCase());
}

export function slugForDestination(destinationKey: string): string | null {
  const key = destinationKey.trim().toLowerCase();
  if (key === 'asia' || key === 'europe') return REGION_SLUGS[key];
  return COUNTRY_SLUGS[key.toUpperCase()] ?? null;
}

export function lifecycleForImportedRow(input: {
  mapped: boolean;
  costVnd: number;
  sellPriceVnd: number;
  selectedForPublish: boolean;
}): EsimCatalogLifecycleName {
  if (!input.mapped) return 'IMPORTED';
  if (input.costVnd <= 0 || input.sellPriceVnd <= 0) return 'REVIEW_REQUIRED';
  if (input.selectedForPublish) return 'PUBLISHED';
  return 'MAPPED';
}

export type SelectableAiraloPackage = {
  destinationKey: string;
  validityDays: number;
  isUnlimited: boolean;
  fupClear: boolean;
  dataAmountMb: number;
  packageType: string;
};

export function selectPublishablePackages<T extends SelectableAiraloPackage>(packages: T[]): T[] {
  const byDest = new Map<string, T[]>();
  for (const pkg of packages) {
    if (!isPublishDestination(pkg.destinationKey)) continue;
    if (pkg.packageType === 'topup') continue;
    if (pkg.isUnlimited && !pkg.fupClear) continue;
    const list = byDest.get(pkg.destinationKey) ?? [];
    list.push(pkg);
    byDest.set(pkg.destinationKey, list);
  }
  const selected: T[] = [];
  for (const list of byDest.values()) {
    selected.push(...pickForDestination(list));
  }
  return selected;
}

const MAX_PUBLISH_PER_DEST = 8;
const MIN_PUBLISH_PER_DEST = 6;

function pickForDestination<T extends SelectableAiraloPackage>(list: T[]): T[] {
  const buckets: Record<'short' | 'standard' | 'long' | 'month' | 'unlimited' | 'other', T[]> = {
    short: [],
    standard: [],
    long: [],
    month: [],
    unlimited: [],
    other: [],
  };
  for (const pkg of list) {
    if (pkg.isUnlimited) {
      if (pkg.fupClear) buckets.unlimited.push(pkg);
      continue;
    }
    buckets[classifyValidityBucket(pkg.validityDays)].push(pkg);
  }
  const out: T[] = [];
  const take = (item: T | null) => {
    if (item && !out.includes(item) && out.length < MAX_PUBLISH_PER_DEST) out.push(item);
  };
  take(pickBestData(buckets.standard));
  take(pickBestData(buckets.long));
  take(pickBestData(buckets.month));
  take(pickHighData(buckets.month, out));
  take(pickBestData(buckets.short));
  const weekUnlimited = buckets.unlimited.filter((pkg) => pkg.validityDays >= 6 && pkg.validityDays <= 10);
  const shortUnlimited = buckets.unlimited.filter((pkg) => pkg.validityDays <= 5);
  take(pickBestData(weekUnlimited.length > 0 ? weekUnlimited : buckets.unlimited));
  take(pickBestData(shortUnlimited));
  if (out.length < MIN_PUBLISH_PER_DEST) {
    const rest = [
      ...buckets.month,
      ...buckets.long,
      ...buckets.standard,
      ...buckets.short,
      ...buckets.other,
      ...buckets.unlimited,
    ].filter((pkg) => !out.includes(pkg));
    rest.sort((left, right) => highDataScore(left) - highDataScore(right) || left.validityDays - right.validityDays);
    for (const pkg of rest) {
      if (out.length >= MIN_PUBLISH_PER_DEST) break;
      take(pkg);
    }
  }
  return out.slice(0, MAX_PUBLISH_PER_DEST);
}

function pickBestData<T extends SelectableAiraloPackage>(items: T[]): T | null {
  if (items.length === 0) return null;
  return [...items].sort((left, right) => dataScore(left) - dataScore(right) || left.validityDays - right.validityDays)[0];
}

function pickHighData<T extends SelectableAiraloPackage>(items: T[], exclude: T[]): T | null {
  const rest = items.filter((pkg) => !exclude.includes(pkg));
  if (rest.length === 0) return null;
  return [...rest].sort((left, right) => highDataScore(left) - highDataScore(right) || left.validityDays - right.validityDays)[0];
}

function dataScore(pkg: SelectableAiraloPackage): number {
  const mb = pkg.dataAmountMb;
  if (mb >= 1024 && mb <= 5120) return 0;
  if (mb >= 512 && mb < 1024) return 1;
  return Math.abs(mb - 3072);
}

function highDataScore(pkg: SelectableAiraloPackage): number {
  const mb = pkg.dataAmountMb;
  if (mb >= 5120 && mb <= 10240) return 0;
  if (mb >= 10241 && mb <= 20480) return 1;
  return Math.abs(mb - 10240);
}

export function readMoney(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}
