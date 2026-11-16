const STORAGE_KEY = 'cardon.pendingMegapayPayment';
/** Quá hạn cửa sổ thanh toán thì coi như không còn phiên nào đang chờ. */
const MAX_AGE_MS = 60 * 60 * 1000;

export interface MegapayCheckoutClient {
  domain: string;
  jsUrl: string;
  cssUrl: string;
}

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
  /** Form fields + client so CardOn can reopen the same MegaPay session. */
  checkoutFormFields?: Record<string, string>;
  checkoutClient?: MegapayCheckoutClient;
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

/** Enough to show the waiting station and mint a fresh MegaPay invoice on reopen. */
export function canResumeMegapayWaiting(
  pending: PendingMegapayPayment | null | undefined,
): boolean {
  return Boolean(pending?.orderId && pending?.orderCode);
}

/**
 * True when stored form fields can open MegaPay once (first redirect).
 * Do NOT reuse after Back — MegaPay rejects duplicate invoiceNo.
 */
export function canOpenStoredMegapayForm(
  pending: PendingMegapayPayment | null | undefined,
): boolean {
  return Boolean(
    pending?.checkoutFormFields &&
      pending.checkoutClient?.domain &&
      pending.checkoutClient?.jsUrl &&
      Object.keys(pending.checkoutFormFields).length > 0,
  );
}

/** @deprecated use canOpenStoredMegapayForm / canResumeMegapayWaiting */
export function canReopenMegapay(pending: PendingMegapayPayment | null | undefined): boolean {
  return canOpenStoredMegapayForm(pending);
}

export function buildMegapayWaitingPath(params: {
  orderId: string;
  orderCode: string;
  email?: string;
  open?: boolean;
}): string {
  const q = new URLSearchParams({
    orderId: params.orderId,
    orderCode: params.orderCode,
  });
  if (params.email?.trim()) q.set('email', params.email.trim());
  if (params.open) q.set('open', '1');
  return `/checkout/waiting?${q.toString()}`;
}

/** Persist MegaPay PG payload then return waiting-station URL (open gateway once). */
export function persistAndPathForMegapayWaiting(params: {
  orderId: string;
  orderCode: string;
  email: string;
  paymentReference: string;
  amount?: string;
  payType?: string;
  resumeHref: string;
  checkoutFormFields: Record<string, string>;
  checkoutClient: MegapayCheckoutClient;
}): string {
  storePendingMegapayPayment({
    orderId: params.orderId,
    orderCode: params.orderCode,
    email: params.email,
    paymentReference: params.paymentReference,
    resumeHref: params.resumeHref,
    amount: params.amount,
    payType: params.payType,
    checkoutFormFields: params.checkoutFormFields,
    checkoutClient: params.checkoutClient,
    savedAt: Date.now(),
  });
  return buildMegapayWaitingPath({
    orderId: params.orderId,
    orderCode: params.orderCode,
    email: params.email,
    open: true,
  });
}
