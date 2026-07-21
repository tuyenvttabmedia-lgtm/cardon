import { Injectable } from '@nestjs/common';
import { PaymentGatewayCode } from '@prisma/client';
import {
  CreateProviderPaymentParams,
  PaymentProviderInterface,
  ProviderPaymentResult,
  ProviderTransactionStatus,
  RefundResult,
  WebhookVerificationResult,
} from '../payment-provider.interface';
import { DepositCodeHttpClient } from './depositcode.client';
import { verifyDepositCodeNotifySignature } from './depositcode.crypto';
import {
  DepositCodeNotifyPayload,
  normalizeDepositCodeNotify,
} from './depositcode.types';
import {
  buildMegapayPgCheckoutForm,
  buildMegapayPgIpnToken,
  isMegapayPgIpnPayload,
  mapMethodCodeToMegapayPg,
} from './megapay-pg';
import { MegapayConfigService } from './megapay.config';

/** Prefer embeddable QR image; EPAY sandbox qr_url often points at an unreachable host page. */
export function resolveDepositCodeQrImage(response: {
  qr_code?: string;
  qr_url?: string;
}): string | undefined {
  const code = response.qr_code?.trim();
  if (code) {
    return code.startsWith('data:') ? code : `data:image/png;base64,${code}`;
  }

  const url = response.qr_url?.trim();
  if (!url) return undefined;

  // Hosted transaction pages (sandbox :5005 /transaction/...) are not QR images and are often unreachable.
  if (/\/transaction\//i.test(url) || /:5005\b/.test(url)) {
    return undefined;
  }

  return url;
}

@Injectable()
export class MegaPayProvider implements PaymentProviderInterface {
  readonly gateway = PaymentGatewayCode.MEGAPAY;

  constructor(
    private readonly configService: MegapayConfigService,
    private readonly httpClient: DepositCodeHttpClient,
  ) {}

  async createPayment(
    params: CreateProviderPaymentParams,
  ): Promise<ProviderPaymentResult> {
    const mapped = mapMethodCodeToMegapayPg(params.methodCode);
    // VietQR / DepositCode stays on registerVA (inline QR). PG layer for VNPAYQR + ZaloPay.
    if (!mapped || mapped.payType === 'VA') {
      return this.createDepositCodePayment(params);
    }
    return this.createPgLayerPayment(params, mapped.payType, mapped.bankCode);
  }

  private async createDepositCodePayment(
    params: CreateProviderPaymentParams,
  ): Promise<ProviderPaymentResult> {
    const amountInt = Math.round(parseFloat(params.amount));
    const customerName = `CARDON ${params.paymentReference}`.slice(0, 50);

    const response = await this.httpClient.registerVirtualAccount({
      mapId: params.paymentReference,
      amount: amountInt,
      customerName,
      expiresAt: params.expiresAt,
      email: params.guestEmail,
    });

    if (response.response_code !== '00') {
      throw new Error(
        `DepositCode register failed: ${response.response_code} ${response.message ?? ''}`.trim(),
      );
    }

    const qrImage = resolveDepositCodeQrImage(response);
    if (!qrImage) {
      throw new Error('DepositCode register succeeded but no QR image returned');
    }

    const expiredAt =
      params.expiresAt?.toISOString() ??
      new Date(Date.now() + 24 * 60 * 60_000).toISOString();

    return {
      paymentUrl: qrImage,
      providerReference: response.account_no ?? params.paymentReference,
      rawResponse: {
        integrationMode: 'deposit_code_va',
        displayMode: 'qr_inline',
        methodCode: params.methodCode ?? 'DEPOSIT_CODE',
        response_code: response.response_code,
        map_id: response.map_id ?? params.paymentReference,
        account_no: response.account_no,
        account_name: response.account_name,
        bank_code: response.bank_code,
        bank_name: response.bank_name,
        qr_url: response.qr_url,
        qr_code: response.qr_code,
        qr_dataRaw: response.qr_dataRaw,
        bank_info: {
          bankCode: response.bank_code,
          bankName: response.bank_name,
          accountNumber: response.account_no,
          accountName: response.account_name,
        },
        amount: amountInt,
        transferContent: response.account_no,
        expired_at: expiredAt,
        gateway: this.gateway,
      },
    };
  }

  private createPgLayerPayment(
    params: CreateProviderPaymentParams,
    payType: 'QR' | 'EW',
    bankCode?: string,
  ): ProviderPaymentResult {
    const config = this.configService.getConfig();
    const amountInt = Math.round(parseFloat(params.amount));
    const { checkoutFormFields, assets, timeStamp } = buildMegapayPgCheckoutForm({
      merId: config.merchantId,
      encodeKey: config.pgEncodeKey,
      environment: config.pgEnvironment,
      amount: amountInt,
      invoiceNo: params.paymentReference,
      merTrxId: params.paymentReference,
      goodsNm: `CardOn ${params.paymentReference}`,
      description: `CardOn ${params.paymentReference}`,
      payType,
      bankCode,
      callBackUrl: config.returnUrl,
      notiUrl: config.callbackUrl,
      reqDomain: config.reqDomain,
      expiresAt: params.expiresAt,
    });

    return {
      paymentUrl: assets.domain,
      providerReference: params.paymentReference,
      rawResponse: {
        integrationMode: 'megapay_pg_v146',
        displayMode: 'open_payment',
        methodCode: params.methodCode ?? payType,
        payType,
        bankCode: bankCode ?? null,
        checkoutUrl: assets.domain,
        checkoutFormFields,
        checkoutClient: {
          domain: assets.domain,
          jsUrl: assets.jsUrl,
          cssUrl: assets.cssUrl,
        },
        amount: amountInt,
        timeStamp,
        gateway: this.gateway,
      },
    };
  }

  async verifyWebhook(
    payload: unknown,
    _headers: Record<string, string>,
  ): Promise<WebhookVerificationResult> {
    if (isMegapayPgIpnPayload(payload)) {
      return this.verifyPgIpn(payload);
    }
    return this.verifyDepositCodeNotify(payload);
  }

  private verifyDepositCodeNotify(
    payload: unknown,
  ): WebhookVerificationResult {
    const body = normalizePayload(payload) as DepositCodeNotifyPayload;
    const notify = normalizeDepositCodeNotify(body);
    const config = this.configService.getConfig();

    const requiredOk =
      !!notify.requestId &&
      !!notify.referenceId &&
      !!notify.requestTime &&
      !!notify.mapId &&
      !!notify.vaAcc &&
      notify.amount !== '' &&
      !!notify.signature;

    if (!requiredOk) {
      return {
        valid: false,
        paymentReference: notify.mapId,
        status: 'PENDING',
        rawPayload: { ...notify, gateway: this.gateway },
      };
    }

    const valid = verifyDepositCodeNotifySignature({
      requestId: notify.requestId,
      referenceId: notify.referenceId,
      requestTime: notify.requestTime,
      amount: notify.amount,
      fee: notify.fee || '0',
      vaAcc: notify.vaAcc,
      mapId: notify.mapId,
      signatureHex: notify.signature,
      publicKeyPem: config.notifyPublicKey,
    });

    const amountNum = parseFloat(notify.amount);
    const amount =
      Number.isFinite(amountNum) ? amountNum.toFixed(2) : undefined;

    return {
      valid,
      paymentReference: notify.mapId,
      status: valid ? 'SUCCESS' : 'PENDING',
      amount,
      providerTransactionId: notify.referenceId,
      rawPayload: {
        ...notify,
        gateway: this.gateway,
        integrationMode: 'deposit_code_va',
      },
    };
  }

  private verifyPgIpn(payload: unknown): WebhookVerificationResult {
    const body = normalizePayload(payload);
    const config = this.configService.getConfig();
    const resultCd = String(body.resultCd ?? '');
    const timeStamp = String(body.timeStamp ?? '');
    const merTrxId = String(body.merTrxId ?? '');
    const trxId = String(body.trxId ?? '');
    const merId = String(body.merId ?? '');
    const amountRaw = String(body.amount ?? '');
    const merchantToken = String(body.merchantToken ?? '');
    const invoiceNo = String(body.invoiceNo ?? '');
    const paymentReference = merTrxId || invoiceNo;

    if (
      !resultCd ||
      !timeStamp ||
      !merTrxId ||
      !trxId ||
      !merId ||
      !amountRaw ||
      !merchantToken
    ) {
      return {
        valid: false,
        paymentReference,
        status: 'PENDING',
        rawPayload: { ...body, gateway: this.gateway, integrationMode: 'megapay_pg_v146' },
      };
    }

    const expected = buildMegapayPgIpnToken({
      resultCd,
      timeStamp,
      merTrxId,
      trxId,
      merId,
      amount: amountRaw,
      encodeKey: config.pgEncodeKey,
      userFee: body.userFee as string | number | null | undefined,
    });

    const valid =
      expected.toLowerCase() === merchantToken.toLowerCase() &&
      merId === config.merchantId;

    const success = resultCd === '00_000' || resultCd === '00';
    const amountNum = parseFloat(amountRaw);
    const amount =
      Number.isFinite(amountNum) ? amountNum.toFixed(2) : undefined;

    return {
      valid,
      paymentReference,
      status: valid && success ? 'SUCCESS' : valid ? 'FAILED' : 'PENDING',
      amount,
      providerTransactionId: trxId,
      rawPayload: {
        ...body,
        gateway: this.gateway,
        integrationMode: 'megapay_pg_v146',
      },
    };
  }

  async queryTransaction(reference: string): Promise<ProviderTransactionStatus> {
    // DepositCode status API only confirms VA mapping — payment success is notify-driven.
    const result = await this.httpClient.checkStatusByMapId(reference);
    return {
      paymentReference: result.map_id ?? reference,
      status: result.response_code === '00' ? 'PENDING' : 'FAILED',
      amount: result.amount != null ? String(result.amount) : '0',
    };
  }

  async refund(_reference: string): Promise<RefundResult> {
    return {
      success: false,
      message:
        'MegaPay refund is not automated — handle via MegaPay portal / DepositCode cancel mapping',
    };
  }
}

function normalizePayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }
  return payload as Record<string, unknown>;
}
