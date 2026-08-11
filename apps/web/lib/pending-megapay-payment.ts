const STORAGE_KEY = 'cardon.pendingMegapayPayment';
/** Quá hạn cửa sổ thanh toán thì coi như không còn phiên nào đang chờ. */
const MAX_AGE_MS = 60 * 60 * 1000;

export interface PendingMegapayPayment {
  orderId: string;
  orderCode: string;
  email: string;
  paymentReference: string;
  /** Where to return after cancel/fail (product checkout / home buy section). */
  resumeHref: string;
  /** Số tiền phải trả, dùng cho màn hình chờ chuyển khoản mã nộp tiền. */
  amount?: string;
  /** MegaPay payType: VA = mã nộp tiền, QR = VNPAYQR, EW = ví. */
  payType?: string;
  savedAt: number;
}

export function storePendingMegapayPayment(payload: PendingMegapayPayment): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
}

export function readPendingMegapayPayment(): PendingMegapayPayment | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PendingMegapayPayment;
    if (!data?.orderCode || !data?.paymentReference) return null;
    if (!data.savedAt || Date.now() - data.savedAt > MAX_AGE_MS) {
      clearPendingMegapayPayment();
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function clearPendingMegapayPayment(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function isMegapaySuccessResult(resultCd: string | null | undefined): boolean {
  const code = (resultCd ?? '').trim().toUpperCase();
  return code === '00_000' || code === '00';
}

/**
 * payType=VA: MegaPay đã cấp tài khoản mã nộp tiền nhưng khách CHƯA chuyển khoản.
 * Không phải thành công, cũng không phải thất bại — phải chờ báo có từ ngân hàng.
 */
export function isMegapayAwaitingTransferResult(
  resultCd: string | null | undefined,
): boolean {
  return (resultCd ?? '').trim().toUpperCase() === '00_005';
}

/** MegaPay customer cancel / user abort common codes + message heuristics. */
export function isMegapayCancelResult(
  resultCd: string | null | undefined,
  resultMsg: string | null | undefined,
): boolean {
  const code = (resultCd ?? '').trim().toUpperCase();
  const msg = (resultMsg ?? '').toLowerCase();
  if (
    code.includes('CANCEL') ||
    code === '99_099' ||
    code === '99_000' ||
    code === 'CC_099'
  ) {
    return true;
  }
  return /cancel|hủy|huy|customer canceled|user cancel/i.test(msg);
}

export function defaultMegapayResumeHref(): string {
  return '/the-game';
}
