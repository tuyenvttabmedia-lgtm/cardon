import { SepayConfig } from './sepay.config';

const SEPAY_QR_BASE = 'https://qr.sepay.vn/img';

export function buildSepayQrUrl(
  config: Pick<SepayConfig, 'bankAccount' | 'bankCode' | 'qrTemplate'>,
  params: { amount: number; transferContent: string },
): string {
  const query = new URLSearchParams({
    acc: config.bankAccount ?? '',
    bank: config.bankCode ?? '',
    amount: String(Math.round(params.amount)),
    des: params.transferContent,
  });

  if (config.qrTemplate) {
    query.set('template', config.qrTemplate);
  }

  return `${SEPAY_QR_BASE}?${query.toString()}`;
}
