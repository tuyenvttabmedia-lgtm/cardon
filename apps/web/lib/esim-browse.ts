import type { EsimPreviewOffer } from '@/lib/esim-offers';

export type EsimRegion = 'asia' | 'europe' | 'america' | 'oceania' | 'africa';

export const ESIM_REGIONS: { id: EsimRegion; label: string }[] = [
  { id: 'asia', label: 'Châu Á' },
  { id: 'europe', label: 'Châu Âu' },
  { id: 'america', label: 'Châu Mỹ' },
  { id: 'oceania', label: 'Châu Đại Dương' },
  { id: 'africa', label: 'Châu Phi' },
];

export const PLAN_GROUPS = [
  { id: 'Standard Fixed', label: 'Dung lượng cố định', note: 'Dùng đến khi hết dung lượng hoặc hết hạn.' },
  { id: 'Standard Unlimited Lite', label: 'Lite', note: '1 GB tốc độ thường mỗi 24 giờ, sau đó giới hạn 512 Kbps.' },
  { id: 'Standard Unlimited Essential', label: 'Essential', note: '1 GB tốc độ thường mỗi 24 giờ, sau đó giới hạn 1,25 Mbps.' },
  { id: 'Standard Unlimited Plus', label: 'Plus', note: '2 GB tốc độ thường mỗi 24 giờ, sau đó giới hạn 2 Mbps.' },
] as const;

const REGION_BY_ISO: Record<string, EsimRegion> = {
  JP: 'asia',
  KR: 'asia',
  TH: 'asia',
  CN: 'asia',
  TW: 'asia',
  SG: 'asia',
  MY: 'asia',
  ID: 'asia',
  PH: 'asia',
  HK: 'asia',
  IN: 'asia',
  KH: 'asia',
  ASIA: 'asia',
  GB: 'europe',
  FR: 'europe',
  DE: 'europe',
  IT: 'europe',
  ES: 'europe',
  EUROPE: 'europe',
  US: 'america',
  CA: 'america',
  AU: 'oceania',
  NZ: 'oceania',
  AE: 'asia',
  TR: 'asia',
  LA: 'asia',
  MO: 'asia',
  MV: 'asia',
  NL: 'europe',
  CH: 'europe',
  AT: 'europe',
  PT: 'europe',
  GR: 'europe',
  EG: 'africa',
  MX: 'america',
  BE: 'europe',
  IE: 'europe',
  CZ: 'europe',
  QA: 'asia',
};

const FEATURED_PHOTO: Record<string, string> = {
  JP: '/images/esim/dest/jp.jpg',
  KR: '/images/esim/dest/kr.jpg',
  TH: '/images/esim/dest/th.jpg',
  CN: '/images/esim/dest/cn.jpg',
  TW: '/images/esim/dest/tw.jpg',
  SG: '/images/esim/dest/sg.jpg',
  MY: '/images/esim/dest/my.jpg',
  ID: '/images/esim/dest/id.jpg',
  PH: '/images/esim/dest/ph.jpg',
  HK: '/images/esim/dest/hk.jpg',
  IN: '/images/esim/dest/in.jpg',
  KH: '/images/esim/dest/kh.jpg',
  US: '/images/esim/dest/us.jpg',
  CA: '/images/esim/dest/ca.jpg',
  GB: '/images/esim/dest/gb.jpg',
  FR: '/images/esim/dest/fr.jpg',
  DE: '/images/esim/dest/de.jpg',
  IT: '/images/esim/dest/it.jpg',
  ES: '/images/esim/dest/es.jpg',
  AU: '/images/esim/dest/au.jpg',
  NZ: '/images/esim/dest/nz.jpg',
  AE: '/images/esim/dest/ae.jpg',
  TR: '/images/esim/dest/tr.jpg',
  LA: '/images/esim/dest/la.jpg',
  MO: '/images/esim/dest/mo.jpg',
  NL: '/images/esim/dest/nl.jpg',
  CH: '/images/esim/dest/ch.jpg',
  AT: '/images/esim/dest/at.jpg',
  PT: '/images/esim/dest/pt.jpg',
  GR: '/images/esim/dest/gr.jpg',
  MV: '/images/esim/dest/mv.jpg',
  EG: '/images/esim/dest/eg.jpg',
  MX: '/images/esim/dest/mx.jpg',
  BE: '/images/esim/dest/be.jpg',
  IE: '/images/esim/dest/ie.jpg',
  CZ: '/images/esim/dest/cz.jpg',
  QA: '/images/esim/dest/qa.jpg',
  ASIA: '/images/esim/dest/asia.jpg',
  EUROPE: '/images/esim/dest/europe.jpg',
};

export function destPhotoFor(iso: string, _remote?: string | null): string {
  return FEATURED_PHOTO[iso.toUpperCase()] ?? '/images/esim/dest/asia.jpg';
}

const DEST_GALLERY_KEYS: Record<string, string[]> = {
  JP: ['jp', 'jp-2', 'jp-3', 'jp-4'],
  KR: ['kr', 'kr-2', 'kr-3', 'kr-4'],
  TH: ['th', 'th-2', 'th-3', 'th-4'],
  CN: ['cn', 'cn-2', 'cn-3', 'cn-4'],
  TW: ['tw', 'tw-2', 'tw-3', 'tw-4'],
  SG: ['sg', 'sg-2', 'sg-3', 'sg-4'],
  MY: ['my', 'my-2', 'my-3', 'my-4'],
  ID: ['id', 'id-2', 'id-3', 'id-5'],
  PH: ['ph', 'ph-2', 'ph-3', 'ph-4'],
  HK: ['hk', 'hk-2', 'hk-3', 'hk-4'],
  IN: ['in', 'in-2', 'in-3', 'in-6'],
  KH: ['kh', 'kh-2', 'kh-3', 'kh-4'],
  US: ['us', 'us-2', 'us-3', 'us-4'],
  CA: ['ca', 'ca-2', 'ca-3', 'ca-4'],
  GB: ['gb', 'gb-2', 'gb-3', 'gb-4'],
  FR: ['fr', 'fr-2', 'fr-3', 'fr-4'],
  DE: ['de', 'de-2', 'de-3', 'de-4'],
  IT: ['it', 'it-2', 'it-3', 'it-4'],
  ES: ['es', 'es-2', 'es-3', 'es-4'],
  AU: ['au', 'au-2', 'au-4', 'au-3'],
  NZ: ['nz', 'nz-2', 'nz-4', 'nz-5'],
  AE: ['ae', 'ae-3', 'ae-4', 'ae-5'],
  TR: ['tr', 'tr-2', 'tr-3', 'tr-4'],
  NL: ['nl', 'nl-2', 'nl-3', 'nl-4'],
  CH: ['ch', 'ch-2', 'ch-3', 'ch-4'],
  AT: ['at', 'at-2', 'at-3', 'at-4'],
  PT: ['pt', 'pt-2', 'pt-3', 'pt-4'],
  GR: ['gr', 'gr-2', 'gr-3', 'gr-5'],
  MV: ['mv', 'mv-2', 'mv-3', 'mv-4'],
  EG: ['eg', 'eg-2', 'eg-4', 'eg-5'],
  MX: ['mx', 'mx-3', 'mx-4', 'mx-6'],
  LA: ['la', 'la-5', 'la-3', 'la-6'],
  MO: ['mo', 'mo-2', 'mo-3', 'mo-4'],
  BE: ['be', 'be-2', 'be-3', 'be-4'],
  IE: ['ie', 'ie-2', 'ie-3', 'ie-5'],
  CZ: ['cz', 'cz-2', 'cz-3', 'cz-4'],
  QA: ['qa', 'qa-2', 'qa-3', 'qa-4'],
  ASIA: ['asia', 'jp', 'th', 'sg'],
  EUROPE: ['europe', 'gb', 'fr', 'it'],
};

function destGalleryKeys(iso: string): string[] {
  const key = iso.toUpperCase();
  return DEST_GALLERY_KEYS[key] ?? [iso.toLowerCase()];
}

function destFile(key: string): string {
  const upper = key.toUpperCase();
  return FEATURED_PHOTO[upper] ?? `/images/esim/dest/${key}.jpg`;
}

export function uniqueImageUrls(urls: Array<string | null | undefined>, limit = 4): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of urls) {
    const value = url?.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

export function destGalleryFor(iso: string): string[] {
  return uniqueImageUrls(destGalleryKeys(iso).map((key) => destFile(key)), 4);
}

export function offerGallery(offer: EsimPreviewOffer, _siblings: EsimPreviewOffer[] = []): string[] {
  return destGalleryFor(offer.countryIso);
}

export const EXPLORE_POPULAR_LIMIT = 10;

export interface EsimCountry {
  iso: string;
  name: string;
  region: EsimRegion | null;
  count: number;
  fromPrice: number;
  operators: string[];
  speedLabel: string;
  photo: string | null;
}

export function foldEsimText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

export function dataAmountMb(label: string): number {
  if (label.startsWith('Không')) return Number.POSITIVE_INFINITY;
  const amount = Number(label.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(amount)) return 0;
  return label.includes('MB') ? amount : amount * 1000;
}

export function durationDays(label: string): number {
  return Number(label.replace(/[^\d]/g, '')) || 0;
}

export function countriesFromOffers(offers: EsimPreviewOffer[]): EsimCountry[] {
  const byIso = new Map<string, EsimCountry>();
  for (const offer of offers) {
    const iso = (offer.countryIso || '').toUpperCase();
    if (!iso) continue;
    const current = byIso.get(iso);
    if (!current) {
      byIso.set(iso, {
        iso,
        name: offer.countryName || iso,
        region: REGION_BY_ISO[iso] ?? null,
        count: 1,
        fromPrice: offer.sellPriceVnd,
        operators: [...offer.operators],
        speedLabel: offer.speedLabel,
        photo: destPhotoFor(iso, offer.countryImageUrl || offer.photo),
      });
      continue;
    }
    current.count += 1;
    current.fromPrice = Math.min(current.fromPrice, offer.sellPriceVnd);
    if (!current.photo || current.photo.startsWith('/images/')) {
      const nextPhoto = destPhotoFor(iso, offer.countryImageUrl || offer.photo);
      if (nextPhoto) current.photo = nextPhoto;
    }
    if (offer.speedLabel && !current.speedLabel) current.speedLabel = offer.speedLabel;
    for (const operator of offer.operators) {
      if (!current.operators.includes(operator)) current.operators.push(operator);
    }
    for (const network of offer.networks ?? []) {
      if (!current.operators.includes(network)) current.operators.push(network);
    }
  }
  return [...byIso.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

export function countryPlansHref(iso: string, fromQuery = ''): string {
  const base = `/esim/quoc-gia/${iso.toUpperCase()}`;
  return fromQuery ? `${base}?from=${encodeURIComponent(fromQuery)}` : base;
}

export function directoryHref(query = ''): string {
  const source = new URLSearchParams(query);
  const safe = new URLSearchParams();
  for (const key of ['q', 'region', 'letter', 'sort', 'page']) {
    const value = source.get(key);
    if (value) safe.set(key, value);
  }
  const next = safe.toString();
  return next ? `/esim/diem-den?${next}` : '/esim/diem-den';
}

export function sanitizeEsimBack(value: string | undefined): string | null {
  if (!value || value.includes('\\')) return null;
  let url: URL;
  try {
    url = new URL(value, 'https://cardon.local');
  } catch {
    return null;
  }
  if (url.origin !== 'https://cardon.local') return null;
  const allowed =
    url.pathname === '/esim/diem-den' || /^\/esim\/quoc-gia\/[A-Za-z]{2,8}$/.test(url.pathname);
  if (!allowed) return null;
  return `${url.pathname}${url.search}`;
}

export function featuredOffers(
  offers: EsimPreviewOffer[],
  mode: 'popular' | 'price' | 'data' | 'duration',
): EsimPreviewOffer[] {
  const fixed = offers.filter((offer) => offer.groupLabel === 'Standard Fixed');
  const pool = fixed.length > 0 ? fixed : offers;
  if (mode === 'popular') {
    const byCountry = new Map<string, EsimPreviewOffer[]>();
    for (const offer of [...pool].sort((a, b) => a.sellPriceVnd - b.sellPriceVnd)) {
      const list = byCountry.get(offer.countryIso) ?? [];
      list.push(offer);
      byCountry.set(offer.countryIso, list);
    }
    const groups = [...byCountry.values()];
    const picks: EsimPreviewOffer[] = [];
    const longest = groups.reduce((max, group) => Math.max(max, group.length), 0);
    for (let index = 0; index < longest && picks.length < 5; index += 1) {
      for (const group of groups) {
        const offer = group[index];
        if (offer && picks.length < 5) picks.push(offer);
      }
    }
    return picks;
  }
  const sorted = [...pool].sort((a, b) => {
    if (mode === 'price') return a.sellPriceVnd - b.sellPriceVnd;
    if (mode === 'data') return dataAmountMb(b.dataLabel) - dataAmountMb(a.dataLabel);
    return durationDays(b.durationLabel) - durationDays(a.durationLabel);
  });
  return sorted.slice(0, 5);
}

export const DIRECTORY_PAGE_SIZE = 32;
export const POPULAR_ISO = ['JP', 'KR', 'TH', 'TW', 'SG', 'AE', 'TR', 'US', 'GB', 'EUROPE', 'ASIA', 'AU'] as const;
