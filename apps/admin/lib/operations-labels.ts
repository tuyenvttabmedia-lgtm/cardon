/** Vietnamese labels for Operations Center (admin ops staff). */

export const MISMATCH_TYPE_VI: Record<string, string> = {
  PAYMENT_RECEIVED_NO_ORDER: 'Đã nhận tiền nhưng chưa có đơn',
  ORDER_NO_PIN: 'Đơn hoàn tất nhưng chưa giao PIN',
  PIN_DELIVERED_NO_LEDGER: 'Đơn đại lý hoàn tất nhưng chưa ghi sổ',
  WEBHOOK_UNPROCESSED: 'Webhook nhận được nhưng chưa xử lý',
  PROVIDER_SUCCESS_ORDER_FAILED: 'NCC thành công nhưng đơn thất bại',
  LEDGER_MISMATCH: 'Sổ quỹ lệch',
  GATEWAY_MISMATCH: 'Cổng thanh toán lệch',
  PROVIDER_TIMEOUT: 'NCC hết thời gian chờ (timeout)',
  WEBHOOK_FAILED: 'Webhook thất bại',
  PAYMENT_MISMATCH: 'Thanh toán lệch đối soát',
  DUPLICATE_PAYMENT: 'Thanh toán trùng lặp',
  DUPLICATE_WEBHOOK: 'Webhook trùng lặp',
  PENDING_TOO_LONG: 'Đơn chờ xử lý quá lâu',
  NO_PROVIDER_RESPONSE: 'NCC không phản hồi',
  UNKNOWN: 'Không xác định',
};

export const SEVERITY_VI: Record<string, string> = {
  CRITICAL: 'Nghiêm trọng',
  HIGH: 'Cao',
  MEDIUM: 'Trung bình',
  LOW: 'Thấp',
};

export const EXCEPTION_STATUS_VI: Record<string, string> = {
  OPEN: 'Mới',
  INVESTIGATING: 'Đang xử lý',
  RESOLVED: 'Đã xử lý',
  IGNORED: 'Bỏ qua',
};

export const RECON_STATUS_VI: Record<string, string> = {
  PENDING: 'Chờ đối soát',
  MATCHED: 'Khớp',
  DIFFERENCE: 'Có chênh lệch',
  MANUAL_REVIEW: 'Cần xem thủ công',
};

export function mismatchTypeLabel(type: string): string {
  return MISMATCH_TYPE_VI[type] ?? type;
}

export function severityLabel(severity: string): string {
  return SEVERITY_VI[severity] ?? severity;
}

export function exceptionStatusLabel(status: string): string {
  return EXCEPTION_STATUS_VI[status] ?? status;
}

/** Prefer API Vietnamese description; fall back to type label. */
export function mismatchDescription(description: string, type: string): string {
  const trimmed = description?.trim() ?? '';
  if (!trimmed) return mismatchTypeLabel(type);
  // Legacy English leftovers from older API builds
  if (/^provider timeout$/i.test(trimmed)) return mismatchTypeLabel('PROVIDER_TIMEOUT');
  if (/^gateway lệch:/i.test(trimmed) || /^gateway/i.test(trimmed)) {
    const code = trimmed.split(':').pop()?.trim().toUpperCase() ?? '';
    const statusVi = RECON_STATUS_VI[code] ?? code;
    return `Cổng thanh toán lệch đối soát: ${statusVi}`;
  }
  return trimmed;
}
