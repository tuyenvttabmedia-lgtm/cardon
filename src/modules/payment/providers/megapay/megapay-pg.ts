import { createHash } from 'crypto';

/**
 * MegaPay Payment Gateway (MGP Merchant Interface V1.4.6)
 * Form-POST + openPayment layer — not DepositCode registerVA.
 */

export type MegapayPgPayType = 'VA' | 'QR' | 'EW';

export type MegapayPgEnvironment = 'sandbox' | 'production';

/** Doc V1.4.6 §16.4 — enduser đã trả tiền, được phép giao hàng. */
const PG_SUCCESS_CODES = new Set(['00_000', '00']);

/**
 * Doc V1.4.6 §5.3 — chỉ áp dụng payType=VA: đã gán tài khoản Mã nộp tiền nhưng
 * enduser CHƯA nộp tiền. Tuyệt đối không giao hàng, chờ IPN 00_000.
 */
export const MEGAPAY_VA_AWAITING_TRANSFER_CODE = '00_005';

/** vaEndDt phải sau vaStartDt tối thiểu 30 phút (doc V1.4.6). */
export const MEGAPAY_VA_MIN_WINDOW_MS = 30 * 60_000;

export function isMegapayPgSuccessCode(resultCd?: string | null): boolean {
  return PG_SUCCESS_CODES.has((resultCd ?? '').trim().toUpperCase());
}

export function isMegapayVaAwaitingTransferCode(
  resultCd?: string | null,
): boolean {
  return (
    (resultCd ?? '').trim().toUpperCase() === MEGAPAY_VA_AWAITING_TRANSFER_CODE
  );
}

const PG_DOMAINS: Record<MegapayPgEnvironment, string> = {
  sandbox: 'https://sandbox.megapay.vn',
  /** Official production host from MegaPay go-live pack (CARDON0001). */
  production: 'https://pg.megapay.vn',
};

const PG_JS: Record<MegapayPgEnvironment, string> = {
  sandbox: 'https://sandbox.megapay.vn/pg_was/js/payment/layer/paymentClient.js',
  production: 'https://pg.megapay.vn/pg_was/js/payment/layer/paymentClient.js',
};

const PG_CSS: Record<MegapayPgEnvironment, string> = {
  sandbox: 'https://sandbox.megapay.vn/pg_was/css/payment/layer/paymentClient.css',
  production: 'https://pg.megapay.vn/pg_was/css/payment/layer/paymentClient.css',
};

export function getMegapayPgApiUrls(environment: MegapayPgEnvironment) {
  const domain = PG_DOMAINS[environment];
  return {
    domain,
    trxStatusUrl: `${domain}/pg_was/order/trxStatus.do`,
    paymentCancelUrl: `${domain}/pg_was/cancel/paymentCancel.do`,
  };
}

/** CardOn methodCode → MegaPay payType (+ optional bankCode for EW). */
export function mapMethodCodeToMegapayPg(methodCode?: string | null): {
  payType: MegapayPgPayType;
  bankCode?: string;
} | null {
  const code = (methodCode ?? '').trim().toUpperCase();
  if (code === 'DEPOSIT_CODE' || code === 'VIETQR' || code === 'MEGAPAY_ATM') {
    return { payType: 'VA' };
  }
  if (code === 'VNPAYQR' || code === 'MEGAPAY_VISA') {
    return { payType: 'QR' };
  }
  if (code === 'ZALOPAY' || code === 'MEGAPAY_WALLET') {
    return { payType: 'EW', bankCode: 'ZALO' };
  }
  return null;
}

export function getMegapayPgDomain(environment: MegapayPgEnvironment): string {
  return PG_DOMAINS[environment];
}

export function getMegapayPgClientAssets(environment: MegapayPgEnvironment) {
  return {
    domain: PG_DOMAINS[environment],
    jsUrl: PG_JS[environment],
    cssUrl: PG_CSS[environment],
  };
}

/** Request merchantToken (1-step, no fee): Sha256(timeStamp + merTrxId + merId + amount + encodeKey) */
export function buildMegapayPgRequestToken(params: {
  timeStamp: string;
  merTrxId: string;
  merId: string;
  amount: string;
  encodeKey: string;
}): string {
  const raw = `${params.timeStamp}${params.merTrxId}${params.merId}${params.amount}${params.encodeKey}`;
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/**
 * Check trx status by merTrxId (samplePage examine):
 * Sha256(timeStamp + merTrxId + merId + payToken + encodeKey) — payToken often empty.
 */
export function buildMegapayPgStatusToken(params: {
  timeStamp: string;
  merTrxId: string;
  merId: string;
  encodeKey: string;
  payToken?: string;
}): string {
  const payToken = params.payToken ?? '';
  const raw = `${params.timeStamp}${params.merTrxId}${params.merId}${payToken}${params.encodeKey}`;
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/**
 * Cancel/refund:
 * merchantToken = Sha256(timeStamp + merTrxId + trxId + merId + amount + payToken + encodeKey)
 * hash = Sha256(merTrxId + refundData + encodeKey) where refundData = API refund password
 */
export function buildMegapayPgCancelTokens(params: {
  timeStamp: string;
  merTrxId: string;
  trxId: string;
  merId: string;
  amount: string;
  encodeKey: string;
  refundPassword: string;
  payToken?: string;
}): { merchantToken: string; hash: string } {
  const payToken = params.payToken ?? '';
  const merchantToken = createHash('sha256')
    .update(
      `${params.timeStamp}${params.merTrxId}${params.trxId}${params.merId}${params.amount}${payToken}${params.encodeKey}`,
      'utf8',
    )
    .digest('hex');
  const hash = createHash('sha256')
    .update(`${params.merTrxId}${params.refundPassword}${params.encodeKey}`, 'utf8')
    .digest('hex');
  return { merchantToken, hash };
}

/**
 * IPN merchantToken (1-step, userFee empty/0):
 * Sha256(resultCd + timeStamp + merTrxId + trxId + merId + amount + encodeKey)
 */
export function buildMegapayPgIpnToken(params: {
  resultCd: string;
  timeStamp: string;
  merTrxId: string;
  trxId: string;
  merId: string;
  amount: string;
  encodeKey: string;
  userFee?: string | number | null;
}): string {
  const fee = params.userFee;
  const hasFee = fee != null && String(fee) !== '' && Number(fee) > 0;
  const raw = hasFee
    ? `${params.resultCd}${params.timeStamp}${params.merTrxId}${params.trxId}${params.merId}${params.amount}${fee}${params.encodeKey}`
    : `${params.resultCd}${params.timeStamp}${params.merTrxId}${params.trxId}${params.merId}${params.amount}${params.encodeKey}`;
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/**
 * MegaPay đối chiếu vaStartDt/vaEndDt với giờ hệ thống của họ (GMT+7).
 * Container chạy UTC nên phải quy đổi tường minh, nếu không cửa sổ VA gửi đi
 * sẽ lùi 7 tiếng và bị coi là đã hết hạn.
 */
const MEGAPAY_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const VA_DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: MEGAPAY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function formatVaDate(date: Date): string {
  const parts = VA_DATE_FORMATTER.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return (
    `${part('year')}${part('month')}${part('day')}` +
    `${part('hour')}${part('minute')}${part('second')}`
  );
}

export interface BuildMegapayPgCheckoutParams {
  merId: string;
  encodeKey: string;
  environment: MegapayPgEnvironment;
  amount: number;
  invoiceNo: string;
  merTrxId: string;
  goodsNm: string;
  description: string;
  payType: MegapayPgPayType;
  bankCode?: string;
  callBackUrl: string;
  notiUrl: string;
  reqDomain: string;
  expiresAt?: Date;
}

export function buildMegapayPgCheckoutForm(
  params: BuildMegapayPgCheckoutParams,
): {
  checkoutFormFields: Record<string, string>;
  assets: ReturnType<typeof getMegapayPgClientAssets>;
  timeStamp: string;
} {
  const timeStamp = String(Date.now());
  const amount = String(Math.round(params.amount));
  const merchantToken = buildMegapayPgRequestToken({
    timeStamp,
    merTrxId: params.merTrxId,
    merId: params.merId,
    amount,
    encodeKey: params.encodeKey,
  });

  const fields: Record<string, string> = {
    merId: params.merId,
    currency: 'VND',
    amount,
    invoiceNo: params.invoiceNo.slice(0, 40),
    goodsNm: sanitizeMegapayText(params.goodsNm, 100),
    payType: params.payType,
    callBackUrl: params.callBackUrl,
    notiUrl: params.notiUrl,
    reqDomain: params.reqDomain,
    description: sanitizeMegapayText(params.description, 100),
    merchantToken,
    timeStamp,
    merTrxId: params.merTrxId.slice(0, 50),
    windowColor: '#0f766e',
    userLanguage: 'VN',
  };

  if (params.bankCode) {
    fields.bankCode = params.bankCode;
  }

  if (params.payType === 'VA') {
    const start = new Date();
    // Bám sát cửa sổ thanh toán của đơn để tiền về muộn không rơi vào đơn đã hết hạn.
    const earliestEnd = start.getTime() + MEGAPAY_VA_MIN_WINDOW_MS;
    const end = new Date(
      params.expiresAt && params.expiresAt.getTime() > earliestEnd
        ? params.expiresAt.getTime()
        : earliestEnd,
    );
    fields.vaStartDt = formatVaDate(start);
    fields.vaEndDt = formatVaDate(end);
    fields.vaContent = sanitizeMegapayText(params.invoiceNo, 50);
  }

  return {
    checkoutFormFields: fields,
    assets: getMegapayPgClientAssets(params.environment),
    timeStamp,
  };
}

/** Strip Vietnamese accents / forbidden chars for MegaPay text fields. */
export function sanitizeMegapayText(input: string, maxLen: number): string {
  const noAccent = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[!@#$%&*<=>?^'|"]/g, '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
  return (noAccent || 'CardOn order').slice(0, maxLen);
}

export function isMegapayPgIpnPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const body = payload as Record<string, unknown>;
  return (
    (body.resultCd != null || body.resultMsg != null) &&
    (body.merTrxId != null || body.invoiceNo != null) &&
    body.merchantToken != null
  );
}
