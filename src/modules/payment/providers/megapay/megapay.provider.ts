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
  isMegapayPgSuccessCode,
  isMegapayVaAwaitingTransferCode,
  mapMethodCodeToMegapayPg,
  type MegapayPgPayType,
} from './megapay-pg';
import { MegapayPgHttpClient } from './megapay-pg.client';
import { MegapayConfigService } from './megapay.config';

@Injectable()
export class MegaPayProvider implements PaymentProviderInterface {
  readonly gateway = PaymentGatewayCode.MEGAPAY;

  constructor(
    private readonly configService: MegapayConfigService,
    private readonly httpClient: DepositCodeHttpClient,
    private readonly pgClient: MegapayPgHttpClient,
  ) {}

  async createPayment(
    params: CreateProviderPaymentParams,
  ): Promise<ProviderPaymentResult> {
    const mapped = mapMethodCodeToMegapayPg(params.methodCode);
    // Toàn bộ bán lẻ đi qua PG V1.4.6: VietQR = payType VA (mã nộp tiền), VNPAYQR = QR, ZaloPay = EW.
    return this.createPgLayerPayment(
      params,
      mapped?.payType ?? 'VA',
      mapped?.bankCode,
    );
  }

  private createPgLayerPayment(
    params: CreateProviderPaymentParams,
    payType: MegapayPgPayType,
    bankCode?: string,
  ): ProviderPaymentResult {
    const config = this.configService.getConfig();
    const amountInt = Math.round(parseFloat(params.amount));
    const { checkoutFormFields, assets, timeStamp } = buildMegapayPgCheckoutForm({
      merId: config.pgMerchantId || config.merchantId,
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
      (merId === config.pgMerchantId || merId === config.merchantId);

    const success = isMegapayPgSuccessCode(resultCd);
    // 00_005: mới gán mã nộp tiền, khách chưa chuyển tiền → giữ PENDING, chờ IPN 00_000.
    const awaitingTransfer = isMegapayVaAwaitingTransferCode(resultCd);
    const amountNum = parseFloat(amountRaw);
    const amount =
      Number.isFinite(amountNum) ? amountNum.toFixed(2) : undefined;

    return {
      valid,
      paymentReference,
      status:
        valid && success
          ? 'SUCCESS'
          : valid && !awaitingTransfer
            ? 'FAILED'
            : 'PENDING',
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
    // Prefer PG trxStatus for PAY-* / PG layer references.
    if (reference.toUpperCase().startsWith('PAY-')) {
      const pg = await this.pgClient.queryByMerTrxId(reference);
      const cd = (pg.resultCd ?? '').toUpperCase();
      const success = isMegapayPgSuccessCode(cd);
      const failed =
        cd.length > 0 &&
        !success &&
        !isMegapayVaAwaitingTransferCode(cd) &&
        !cd.startsWith('99');
      return {
        paymentReference: pg.merTrxId ?? reference,
        status: success ? 'SUCCESS' : failed ? 'FAILED' : 'PENDING',
        amount: pg.amount ?? '0',
      };
    }

    // DepositCode status API only confirms VA mapping — payment success is notify-driven.
    const result = await this.httpClient.checkStatusByMapId(reference);
    return {
      paymentReference: result.map_id ?? reference,
      status: result.response_code === '00' ? 'PENDING' : 'FAILED',
      amount: result.amount != null ? String(result.amount) : '0',
    };
  }

  async refund(
    reference: string,
    amount?: string,
  ): Promise<RefundResult> {
    const config = this.configService.getConfig();
    if (!config.pgRefundPassword) {
      return {
        success: false,
        message:
          'MegaPay refund password is not configured — set MEGAPAY_PG_REFUND_PASSWORD',
      };
    }

    // Need MegaPay trxId from a prior status check / stored provider reference.
    const status = await this.pgClient.queryByMerTrxId(reference);

    // Doc V1.4.6 §7: chuyển khoản qua Mã nộp tiền không được phép hủy/hoàn tiền.
    if ((status.payType ?? '').trim().toUpperCase() === 'VA') {
      return {
        success: false,
        message:
          'MegaPay không hỗ trợ hoàn tiền cho chuyển khoản qua mã nộp tiền (payType=VA) — cần hoàn thủ công qua ngân hàng.',
      };
    }

    const trxId = status.trxId;
    if (!trxId) {
      return {
        success: false,
        message: `MegaPay trxId not found for ${reference} — cannot cancel`,
      };
    }
    const cancelAmount = amount ?? status.amount;
    if (!cancelAmount) {
      return {
        success: false,
        message: `MegaPay amount missing for ${reference} — cannot cancel`,
      };
    }

    const result = await this.pgClient.cancelPayment({
      merTrxId: reference,
      trxId,
      amount: cancelAmount,
      payType: status.payType,
    });
    const cd = (result.resultCd ?? '').toUpperCase();
    const success = isMegapayPgSuccessCode(cd);
    return {
      success,
      message: result.resultMsg ?? (success ? 'Cancelled' : `Cancel failed (${cd || 'unknown'})`),
    };
  }
}

function normalizePayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }
  return payload as Record<string, unknown>;
}
