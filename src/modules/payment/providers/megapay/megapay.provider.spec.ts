/**
 * VNPT ePay DepositCode adapter (wired as MegaPay gateway).
 */
import { PaymentGatewayCode } from '@prisma/client';
import { generateKeyPairSync, createSign } from 'crypto';
import { DepositCodeHttpClient } from './depositcode.client';
import { MegapayConfigService } from './megapay.config';
import { MegaPayProvider } from './megapay.provider';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 1024,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const TEST_CONFIG = {
  merchantId: 'VAP001',
  pgMerchantId: 'VAP001',
  secretKey: '31feae316de0a42520ef5ec4',
  pgEncodeKey: 'pg-encode-key-for-tests-only',
  pgRefundPassword: 'pg-refund-password-for-tests-only',
  pgEnvironment: 'sandbox' as const,
  endpoint:
    'https://sandboxva.ecollect.vn:10003/ApiResf_VirtualAccount/services/registerVA',
  returnUrl: 'https://cardon.vn/checkout/result',
  webhookSecret: 'unused',
  callbackUrl: 'https://cardon.vn/api/v1/payments/webhook/megapay',
  bankCode: 'WOORIBANK',
  notifyPublicKey: publicKey,
  reqDomain: 'https://cardon.vn',
};

interface PgClientMock {
  queryByMerTrxId: jest.Mock;
  cancelPayment: jest.Mock;
}

function buildProvider(fetchMock: jest.Mock): {
  provider: MegaPayProvider;
  pgClient: PgClientMock;
} {
  const configService = {
    getConfig: () => TEST_CONFIG,
    isConfigured: () => true,
  } as unknown as MegapayConfigService;
  const httpClient = new DepositCodeHttpClient(configService, fetchMock);
  const pgClient: PgClientMock = {
    queryByMerTrxId: jest.fn(),
    cancelPayment: jest.fn(),
  };
  return {
    provider: new MegaPayProvider(configService, httpClient, pgClient as never),
    pgClient,
  };
}

function signNotify(fields: {
  RequestId: string;
  ReferenceId: string;
  RequestTime: string;
  Amount: number;
  Fee: number;
  VaAcc: string;
  MapId: string;
}): string {
  const canonical = [
    fields.RequestId,
    fields.ReferenceId,
    fields.RequestTime,
    String(fields.Amount),
    String(fields.Fee),
    fields.VaAcc,
    fields.MapId,
  ].join('|');
  const signer = createSign('RSA-SHA256');
  signer.update(canonical, 'utf8');
  signer.end();
  return signer.sign(privateKey).toString('hex');
}

describe('MegaPayProvider (DepositCode VA)', () => {
  let fetchMock: jest.Mock;
  let provider: MegaPayProvider;
  let pgClient: PgClientMock;

  beforeEach(() => {
    fetchMock = jest.fn();
    ({ provider, pgClient } = buildProvider(fetchMock));
  });

  describe('createPayment', () => {
    it('builds MegaPay PG layer form for VietQR/DepositCode (payType=VA)', async () => {
      const expiresAt = new Date(Date.now() + 45 * 60_000);

      const result = await provider.createPayment({
        paymentReference: 'PAY-REF-001',
        amount: '100000',
        orderId: 'order-1',
        gateway: PaymentGatewayCode.MEGAPAY,
        methodCode: 'DEPOSIT_CODE',
        expiresAt,
      });

      // Không được gọi registerVA nữa (API cũ chạy credential sandbox).
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.rawResponse.integrationMode).toBe('megapay_pg_v146');
      expect(result.rawResponse.displayMode).toBe('open_payment');
      expect(result.rawResponse.payType).toBe('VA');

      const fields = result.rawResponse.checkoutFormFields as Record<string, string>;
      expect(fields.payType).toBe('VA');
      expect(fields.merId).toBe('VAP001');
      expect(fields.vaContent).toBe('PAY-REF-001');
      expect(fields.vaStartDt).toMatch(/^\d{14}$/);
      expect(fields.vaEndDt).toMatch(/^\d{14}$/);
      expect(Number(fields.vaEndDt)).toBeGreaterThan(Number(fields.vaStartDt));
    });

    it('keeps VA window at least 30 minutes when the order expires sooner', async () => {
      const result = await provider.createPayment({
        paymentReference: 'PAY-REF-002',
        amount: '100000',
        orderId: 'order-1b',
        gateway: PaymentGatewayCode.MEGAPAY,
        methodCode: 'DEPOSIT_CODE',
        expiresAt: new Date(Date.now() + 5 * 60_000),
      });

      const fields = result.rawResponse.checkoutFormFields as Record<string, string>;
      const parse = (v: string) =>
        new Date(
          Number(v.slice(0, 4)),
          Number(v.slice(4, 6)) - 1,
          Number(v.slice(6, 8)),
          Number(v.slice(8, 10)),
          Number(v.slice(10, 12)),
          Number(v.slice(12, 14)),
        ).getTime();

      expect(parse(fields.vaEndDt) - parse(fields.vaStartDt)).toBeGreaterThanOrEqual(
        30 * 60_000 - 1000,
      );
    });

    it('builds MegaPay PG layer form for VNPAYQR (payType=QR)', async () => {
      const result = await provider.createPayment({
        paymentReference: 'PAY-QR-001',
        amount: '50000',
        orderId: 'order-2',
        gateway: PaymentGatewayCode.MEGAPAY,
        methodCode: 'VNPAYQR',
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.rawResponse.integrationMode).toBe('megapay_pg_v146');
      expect(result.rawResponse.displayMode).toBe('open_payment');
      expect(result.rawResponse.payType).toBe('QR');
      const fields = result.rawResponse.checkoutFormFields as Record<string, string>;
      expect(fields.payType).toBe('QR');
      expect(fields.merId).toBe('VAP001');
      expect(fields.amount).toBe('50000');
      expect(fields.merchantToken).toHaveLength(64);
      expect(result.rawResponse.checkoutClient).toMatchObject({
        domain: 'https://sandbox.megapay.vn',
      });
    });

    it('builds MegaPay PG layer form for ZaloPay (payType=EW, bankCode=ZALO)', async () => {
      const result = await provider.createPayment({
        paymentReference: 'PAY-ZL-001',
        amount: '75000',
        orderId: 'order-3',
        gateway: PaymentGatewayCode.MEGAPAY,
        methodCode: 'ZALOPAY',
      });

      const fields = result.rawResponse.checkoutFormFields as Record<string, string>;
      expect(fields.payType).toBe('EW');
      expect(fields.bankCode).toBe('ZALO');
    });
  });

  describe('verifyWebhook', () => {
    it('accepts valid DepositCode notify signature', async () => {
      const payload = {
        MerchantCode: 'VAP001',
        RequestId: 'VAP001REQ1',
        RequestTime: '2024-10-15 14:52:58',
        VaAcc: '902000225341',
        VaName: 'VAP001 NGUYEN VAN A',
        MapId: 'PAY-REF-001',
        ReferenceId: 'VAP001REF1',
        Amount: 100000,
        Fee: 0,
        BankCode: 'WOORIBANK',
        BankName: 'WOORI',
      };
      const Signature = signNotify({
        RequestId: payload.RequestId,
        ReferenceId: payload.ReferenceId,
        RequestTime: payload.RequestTime,
        Amount: payload.Amount,
        Fee: payload.Fee,
        VaAcc: payload.VaAcc,
        MapId: payload.MapId,
      });

      const result = await provider.verifyWebhook({ ...payload, Signature }, {});

      expect(result.valid).toBe(true);
      expect(result.paymentReference).toBe('PAY-REF-001');
      expect(result.status).toBe('SUCCESS');
      expect(result.amount).toBe('100000.00');
      expect(result.providerTransactionId).toBe('VAP001REF1');
    });

    it('rejects invalid signature', async () => {
      const result = await provider.verifyWebhook(
        {
          MerchantCode: 'VAP001',
          RequestId: 'VAP001REQ1',
          RequestTime: '2024-10-15 14:52:58',
          VaAcc: '902000225341',
          MapId: 'PAY-REF-001',
          ReferenceId: 'VAP001REF1',
          Amount: 100000,
          Fee: 0,
          Signature: 'deadbeef',
        },
        {},
      );
      expect(result.valid).toBe(false);
    });

    it('accepts valid MegaPay PG IPN merchantToken', async () => {
      const { buildMegapayPgIpnToken } = await import('./megapay-pg');
      const payload = {
        resultCd: '00_000',
        resultMsg: 'SUCCESS',
        timeStamp: '1600065260940',
        merTrxId: 'PAY-PG-001',
        trxId: 'EPAYTRX001',
        merId: 'VAP001',
        amount: '100000',
        invoiceNo: 'PAY-PG-001',
      };
      const merchantToken = buildMegapayPgIpnToken({
        ...payload,
        encodeKey: TEST_CONFIG.pgEncodeKey,
      });

      const result = await provider.verifyWebhook({ ...payload, merchantToken }, {});

      expect(result.valid).toBe(true);
      expect(result.status).toBe('SUCCESS');
      expect(result.paymentReference).toBe('PAY-PG-001');
      expect(result.amount).toBe('100000.00');
    });

    it('treats VA result 00_005 (assigned, not transferred) as PENDING', async () => {
      const { buildMegapayPgIpnToken } = await import('./megapay-pg');
      const payload = {
        resultCd: '00_005',
        resultMsg: 'Assign Dcode success',
        timeStamp: '1600065260940',
        merTrxId: 'PAY-VA-001',
        trxId: 'EPAYTRX002',
        merId: 'VAP001',
        amount: '100000',
        invoiceNo: 'PAY-VA-001',
        payType: 'VA',
      };
      const merchantToken = buildMegapayPgIpnToken({
        ...payload,
        encodeKey: TEST_CONFIG.pgEncodeKey,
      });

      const result = await provider.verifyWebhook({ ...payload, merchantToken }, {});

      expect(result.valid).toBe(true);
      expect(result.status).toBe('PENDING');
      expect(result.paymentReference).toBe('PAY-VA-001');
    });
  });

  describe('queryTransaction', () => {
    it('returns PENDING for VA result 00_005', async () => {
      pgClient.queryByMerTrxId.mockResolvedValue({
        resultCd: '00_005',
        resultMsg: 'Assign Dcode success',
        merTrxId: 'PAY-VA-001',
        trxId: 'EPAYTRX002',
        amount: '100000',
        payType: 'VA',
      });

      const result = await provider.queryTransaction('PAY-VA-001');

      expect(result.status).toBe('PENDING');
    });
  });

  describe('refund', () => {
    it('refuses to cancel a VA (deposit code) transaction', async () => {
      pgClient.queryByMerTrxId.mockResolvedValue({
        resultCd: '00_000',
        merTrxId: 'PAY-VA-001',
        trxId: 'EPAYTRX002',
        amount: '100000',
        payType: 'VA',
      });

      const result = await provider.refund('PAY-VA-001');

      expect(result.success).toBe(false);
      expect(result.message).toContain('mã nộp tiền');
      expect(pgClient.cancelPayment).not.toHaveBeenCalled();
    });

    it('still cancels a QR transaction', async () => {
      pgClient.queryByMerTrxId.mockResolvedValue({
        resultCd: '00_000',
        merTrxId: 'PAY-QR-001',
        trxId: 'EPAYTRX003',
        amount: '50000',
        payType: 'QR',
      });
      pgClient.cancelPayment.mockResolvedValue({ resultCd: '00_000' });

      const result = await provider.refund('PAY-QR-001');

      expect(result.success).toBe(true);
      expect(pgClient.cancelPayment).toHaveBeenCalledTimes(1);
    });
  });
});
