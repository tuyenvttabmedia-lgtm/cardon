/** Vietnamese Telegram / admin alert copy for ops notifications. */

export function formatVndAmount(value: number): string {
  return `${Math.round(value).toLocaleString('vi-VN')}đ`;
}

/** Drop local/mock labels left over from seed data. */
export function displayProviderName(name: string, code?: string): string {
  const cleaned = name
    .replace(/\s*\((?:Mock\s*)?(?:Local(?:\s+Full)?|Smoke\s+Mock)[^)]*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || /mock/i.test(cleaned)) {
    if (code === 'ESALE') return 'eSale';
    return code || cleaned || 'NCC';
  }
  return cleaned;
}

export function failureCodeLabelVi(code: string): string {
  const map: Record<string, string> = {
    LOW_BALANCE: 'Hết số dư NCC',
    OUT_OF_STOCK: 'Hết thẻ / hết hàng',
    TIMEOUT: 'Timeout NCC',
    UNKNOWN: 'Lỗi không xác định',
    MAINTENANCE: 'NCC đang bảo trì',
    INVALID_SKU: 'SKU không hợp lệ',
  };
  return map[code] ?? code;
}

export function fulfillmentStatusLabelVi(status: string): string {
  const map: Record<string, string> = {
    PENDING: 'Chờ xử lý',
    PROCESSING: 'Đang giao',
    COMPLETED: 'Hoàn thành',
    FAILED: 'Thất bại',
    WAITING_ADMIN_RETRY: 'Chờ admin giao lại',
    NEED_MANUAL_REVIEW: 'Cần rà soát',
  };
  return map[status] ?? status;
}

export function paymentStatusLabelVi(status: string): string {
  const map: Record<string, string> = {
    WAITING_PAYMENT: 'Chờ thanh toán',
    PAID: 'Đã thanh toán',
    FAILED: 'Thanh toán thất bại',
    EXPIRED: 'Hết hạn',
    REFUNDED: 'Đã hoàn tiền',
  };
  return map[status] ?? status;
}

export function formatProviderLowBalanceTelegram(params: {
  providerName: string;
  providerCode: string;
  balance: number;
  threshold: number;
}): { title: string; body: string } {
  const name = displayProviderName(params.providerName, params.providerCode);
  const title = `Số dư NCC thấp: ${name}`;
  const body = [
    `<b>SỐ DƯ NCC THẤP</b>`,
    `NCC: ${name}`,
    `Số dư: ${formatVndAmount(params.balance)}`,
    `Ngưỡng cảnh báo: ${formatVndAmount(params.threshold)}`,
    `→ Cần nạp ví ${name} trước khi giao đơn mới`,
  ].join('\n');
  return { title, body };
}

export function formatAdminRetryTelegram(params: {
  orderCode: string;
  variantType: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  phone: string;
  telco: string;
  amount?: number;
  failureCode: string;
  retCode?: number;
  retMsg: string;
  providerMessage: string;
  totalAmount?: number;
  requestId: string;
  esaleId: string;
  attempt?: number;
}): { title: string; body: string } {
  const title = `Cần giao lại: ${params.orderCode}`;
  const pay = paymentStatusLabelVi(params.paymentStatus ?? 'PAID');
  const fulfill = fulfillmentStatusLabelVi(
    params.fulfillmentStatus ?? 'WAITING_ADMIN_RETRY',
  );
  const amountPart =
    params.amount != null && !Number.isNaN(params.amount)
      ? ` · ${formatVndAmount(params.amount)}`
      : '';
  const errorLabel = failureCodeLabelVi(params.failureCode);
  const detailBits = [
    params.retMsg && params.retMsg !== '—' ? params.retMsg : null,
    params.retCode != null ? `retCode ${params.retCode}` : null,
    params.providerMessage && params.providerMessage !== '—'
      ? params.providerMessage
      : null,
  ].filter(Boolean);
  const errorDetail = detailBits.length ? ` (${detailBits.join(' · ')})` : '';

  const isTopup =
    params.variantType === 'TOPUP' || params.variantType === 'DATA';
  const action = isTopup
    ? '→ Đơn hàng → Giao lại (chỉ kiểm tra trạng thái, không nạp lại)'
    : '→ Đơn hàng → Giao lại / kiểm tra NCC';

  const lines = [
    `<b>CẦN GIAO LẠI</b>`,
    `${params.variantType} · ${params.orderCode}`,
    `${pay} · ${fulfill}`,
    `${params.phone} · ${params.telco}${amountPart}`,
    `Lỗi: ${errorLabel}${errorDetail}`,
    params.totalAmount != null
      ? `Đã trừ ví NCC: ${formatVndAmount(params.totalAmount)}`
      : null,
    `Mã NCC: ${params.esaleId}${params.attempt != null ? ` · Lần ${params.attempt}` : ''}`,
    action,
  ].filter(Boolean);

  return { title, body: lines.join('\n') };
}
