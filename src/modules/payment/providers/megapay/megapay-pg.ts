import { createHash } from 'crypto';

/**
 * MegaPay Payment Gateway (MGP Merchant Interface V1.4.6)
 * Form-POST + openPayment layer — not DepositCode registerVA.
 */

export type MegapayPgPayType = 'VA' | 'QR' | 'EW';

export type MegapayPgEnvironment = 'sandbox' | 'production';

const PG_DOMAINS: Record<MegapayPgEnvironment, string> = {
  sandbox: 'https://sandbox.megapay.vn',
  production: 'https://payment.megapay.vn',
};

const PG_JS: Record<MegapayPgEnvironment, string> = {
  sandbox: 'https://sandbox.megapay.vn/pg_was/js/payment/layer/paymentClient.js',
  production: 'https://payment.megapay.vn/pg_was/js/payment/layer/paymentClient.js',
};

const PG_CSS: Record<MegapayPgEnvironment, string> = {
  sandbox: 'https://sandbox.megapay.vn/pg_was/css/payment/layer/paymentClient.css',
  production: 'https://payment.megapay.vn/pg_was/css/payment/layer/paymentClient.css',
};

/** CardOn methodCode → MegaPay payType (+ optional bankCode for EW). */
export function mapMethodCodeToMegapayPg(methodCode?: string | null): {
  payType: MegapayPgPayType;
  bankCode?: string;
} | null {
  const code = (methodCode ?? '').toUpperCase();
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

export function formatVaDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
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
    const end =
      params.expiresAt && params.expiresAt.getTime() > start.getTime() + 30 * 60_000
        ? params.expiresAt
        : new Date(start.getTime() + 24 * 60 * 60_000);
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
