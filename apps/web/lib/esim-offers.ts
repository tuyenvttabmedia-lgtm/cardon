import { getApiBaseUrl } from '@/lib/utils';

export interface EsimPreviewOffer {
  id: string;
  variantId: string;
  productId: string;
  productSlug: string;
  productName: string;
  sku: string;
  title: string;
  providerDescription: string;
  summary: string;
  dataLabel: string;
  durationLabel: string;
  speedLabel: string;
  operators: string[];
  groupLabel: string;
  sellPriceVnd: number;
  countryIso: string;
  countryName: string;
  testData: false;
  photo?: string | null;
  operatorInfo?: string[];
  shortInfo?: string;
  otherInfo?: string;
  activationPolicy?: string;
  activationLabel?: string;
  apnType?: string;
  apnValue?: string;
  isRoaming?: boolean;
  rechargeable?: boolean;
  networks?: string[];
  countryImageUrl?: string;
  operatorImageUrl?: string;
  fairUsagePolicy?: string;
}

interface ApiSuccess<T> {
  success: true;
  data: T;
}

export type EsimOfferResult =
  | { ok: true; offers: EsimPreviewOffer[]; salesOpen: boolean }
  | { ok: false; error: string };

function readStorefrontPayload(payload: unknown): { offers: EsimPreviewOffer[]; salesOpen: boolean } | null {
  const data = (payload as ApiSuccess<unknown> | undefined)?.data;
  if (Array.isArray(data)) {
    return { offers: data as EsimPreviewOffer[], salesOpen: false };
  }
  if (data && typeof data === 'object' && Array.isArray((data as { offers?: unknown }).offers)) {
    const body = data as { offers: EsimPreviewOffer[]; salesOpen?: unknown };
    return { offers: body.offers, salesOpen: body.salesOpen === true };
  }
  return null;
}

export async function listEsimPreviewOffers(): Promise<EsimOfferResult> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/esim/offers`, { cache: 'no-store' });
    if (!response.ok) {
      return { ok: false, error: 'Không tải được danh sách gói eSIM.' };
    }
    const parsed = readStorefrontPayload(await response.json());
    if (!parsed) {
      return { ok: false, error: 'Phản hồi eSIM không đúng định dạng.' };
    }
    return { ok: true, offers: parsed.offers, salesOpen: parsed.salesOpen };
  } catch {
    return { ok: false, error: 'Không kết nối được máy chủ. Thử lại sau.' };
  }
}
