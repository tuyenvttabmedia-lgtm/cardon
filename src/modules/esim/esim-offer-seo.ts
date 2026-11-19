import { COUNTRY_SLUGS, REGION_SLUGS } from './esim-catalogue.rules';

/** Strip product-prefix `esim-` so public paths stay `/esim/han-quoc-…` not `/esim/esim-han-quoc-…`. */
export function destinationSeoSegment(destinationKey: string, countryIso?: string): string {
  const key = destinationKey.trim().toLowerCase();
  if (key === 'asia' || key === 'europe' || key === 'world') {
    return REGION_SLUGS[key].replace(/^esim-/, '');
  }
  const iso = (countryIso ?? destinationKey).trim().toUpperCase();
  const productSlug = COUNTRY_SLUGS[iso];
  if (productSlug) return productSlug.replace(/^esim-/, '');
  return key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'esim';
}

export function dataSeoSegment(input: { dataAmountMb?: number; unlimited?: boolean }): string {
  if (input.unlimited === true || (input.dataAmountMb ?? 0) < 0) return 'khong-gioi-han';
  const mb = Number(input.dataAmountMb ?? 0);
  if (!Number.isFinite(mb) || mb <= 0) return 'data';
  if (mb >= 1024) {
    const gb = mb / 1024;
    const rounded = Number.isInteger(gb) ? String(gb) : gb.toFixed(1).replace(/\.0$/, '');
    return `${rounded}gb`;
  }
  return `${Math.round(mb)}mb`;
}

export function durationSeoSegment(input: { duration?: number; durationUnit?: string }): string {
  const n = Number(input.duration ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 'goi';
  const unit = (input.durationUnit ?? 'day').toLowerCase();
  if (unit.startsWith('day')) return `${Math.round(n)}-ngay`;
  if (unit.startsWith('hour')) return `${Math.round(n)}-gio`;
  return `${Math.round(n)}-ngay`;
}

export function buildEsimOfferSeoBase(input: {
  destinationKey: string;
  countryIso?: string;
  dataAmountMb?: number;
  unlimited?: boolean;
  duration?: number;
  durationUnit?: string;
}): string {
  const dest = destinationSeoSegment(input.destinationKey, input.countryIso);
  const data = dataSeoSegment(input);
  const days = durationSeoSegment(input);
  return `${dest}-${data}-${days}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 96);
}

/** Stable short token from legacy Airalo-style public slug (`kr-jang-15days-2gb` → `jang`). */
export function legacyDisambiguator(publicSlug: string): string {
  const parts = publicSlug
    .toLowerCase()
    .split('-')
    .filter((part) => part && !/^\d+(days?|gb|mb)?$/.test(part) && !/^[a-z]{2}$/.test(part));
  const token = parts[0] ?? publicSlug.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  return token.slice(0, 16) || 'goi';
}

/**
 * Assign unique SEO slugs for storefront URLs.
 * Prefer `han-quoc-2gb-15-ngay`; on collision append provider token.
 */
export function assignEsimSeoSlugs<T extends { publicSlug: string; base: string }>(
  rows: T[],
): Map<string, string> {
  const claimed = new Map<string, string>(); // seoSlug → publicSlug
  const out = new Map<string, string>(); // publicSlug → seoSlug

  const sorted = [...rows].sort((a, b) => a.publicSlug.localeCompare(b.publicSlug));
  for (const row of sorted) {
    let candidate = row.base || row.publicSlug;
    if (claimed.has(candidate) && claimed.get(candidate) !== row.publicSlug) {
      candidate = `${row.base}-${legacyDisambiguator(row.publicSlug)}`
        .replace(/-+/g, '-')
        .slice(0, 120);
    }
    let n = 2;
    while (claimed.has(candidate) && claimed.get(candidate) !== row.publicSlug) {
      candidate = `${row.base}-${legacyDisambiguator(row.publicSlug)}-${n}`.slice(0, 120);
      n += 1;
    }
    claimed.set(candidate, row.publicSlug);
    out.set(row.publicSlug, candidate);
  }
  return out;
}
