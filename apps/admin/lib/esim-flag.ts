const SLUG_TO_ISO: Record<string, string> = {
  'esim-nhat-ban': 'JP',
  'esim-han-quoc': 'KR',
  'esim-thai-lan': 'TH',
  'esim-trung-quoc': 'CN',
  'esim-dai-loan': 'TW',
  'esim-singapore': 'SG',
  'esim-malaysia': 'MY',
  'esim-indonesia': 'ID',
  'esim-philippines': 'PH',
  'esim-hong-kong': 'HK',
  'esim-uc': 'AU',
  'esim-my': 'US',
  'esim-an-do': 'IN',
  'esim-campuchia': 'KH',
  'esim-anh': 'GB',
  'esim-phap': 'FR',
  'esim-duc': 'DE',
  'esim-italy': 'IT',
  'esim-tay-ban-nha': 'ES',
  'esim-canada': 'CA',
  'esim-new-zealand': 'NZ',
  'esim-uae': 'AE',
  'esim-tho-nhi-ky': 'TR',
  'esim-lao': 'LA',
  'esim-macao': 'MO',
  'esim-ha-lan': 'NL',
  'esim-thuy-si': 'CH',
  'esim-ao': 'AT',
  'esim-bo-dao-nha': 'PT',
  'esim-hy-lap': 'GR',
  'esim-maldives': 'MV',
  'esim-ai-cap': 'EG',
  'esim-mexico': 'MX',
  'esim-bi': 'BE',
  'esim-ireland': 'IE',
  'esim-sec': 'CZ',
  'esim-qatar': 'QA',
  'esim-chau-a': 'ASIA',
  'esim-chau-au': 'EUROPE',
};

const NAME_TO_ISO: Array<[string, string]> = [
  ['nhật bản', 'JP'],
  ['han quốc', 'KR'],
  ['hàn quốc', 'KR'],
  ['thái lan', 'TH'],
  ['trung quốc', 'CN'],
  ['đài loan', 'TW'],
  ['singapore', 'SG'],
  ['malaysia', 'MY'],
  ['indonesia', 'ID'],
  ['philippines', 'PH'],
  ['hồng kông', 'HK'],
  ['hong kong', 'HK'],
  ['new zealand', 'NZ'],
  ['ấn độ', 'IN'],
  ['campuchia', 'KH'],
  ['tây ban nha', 'ES'],
  ['châu âu', 'EUROPE'],
  ['châu á', 'ASIA'],
  ['hoa kỳ', 'US'],
  ['canada', 'CA'],
  ['italy', 'IT'],
  ['pháp', 'FR'],
  ['đức', 'DE'],
  ['anh', 'GB'],
  ['úc', 'AU'],
  ['mỹ', 'US'],
  ['uae', 'AE'],
  ['thổ nhĩ kỳ', 'TR'],
  ['lào', 'LA'],
  ['macao', 'MO'],
  ['hà lan', 'NL'],
  ['thụy sĩ', 'CH'],
  ['bồ đào nha', 'PT'],
  ['hy lạp', 'GR'],
  ['maldives', 'MV'],
  ['ai cập', 'EG'],
  ['mexico', 'MX'],
  ['esim áo', 'AT'],
  ['bỉ', 'BE'],
  ['ireland', 'IE'],
  ['séc', 'CZ'],
  ['qatar', 'QA'],
];

export function esimProductIso(name: string, slug?: string | null): string | null {
  const slugKey = (slug ?? '').trim().toLowerCase();
  if (slugKey && SLUG_TO_ISO[slugKey]) return SLUG_TO_ISO[slugKey];
  const folded = name.trim().toLowerCase();
  const hit = NAME_TO_ISO.find(([key]) => folded === key || folded.includes(key));
  return hit?.[1] ?? null;
}

export function flagCdnCode(iso: string | null): string | null {
  if (!iso) return null;
  const key = iso.toUpperCase();
  if (key === 'GB' || key === 'UK') return 'gb';
  if (key === 'EUROPE' || key === 'EU') return 'eu';
  if (/^[A-Z]{2}$/.test(key)) return key.toLowerCase();
  return null;
}
