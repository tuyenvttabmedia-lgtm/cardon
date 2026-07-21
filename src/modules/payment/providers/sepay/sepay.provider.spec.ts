/**
 * Phase 2E.3 — SePay Payment Adapter Tests
 */
import { PaymentGatewayCode } from '@prisma/client';
import { createHmac } from 'crypto';
import { SepayConfigService } from './sepay.config';
import { SePayProvider } from './sepay.provider';
import { buildTransferContent } from './sepay.types';

const TEST_CONFIG = {
  mode: 'legacy_qr' as const,
  apiKey: 'sepay-test-api-key',
  webhookSecret: 'sepay-webhook-secret',
  bankAccount: '1017588888',
  bankCode: 'Vietcombank',
  accountName: 'CARDON COMPANY',
  qrTemplate: 'compact',
};

function buildProvider(): SePayProvider {
  const configService = {
    getConfig: () => TEST_CONFIG,
    isConfigured: () => true,
  } as unknown as SepayConfigService;
  return new SePayProvider(configService);
}

function authHeader(apiKey = TEST_CONFIG.apiKey): Record<string, string> {
  return { Authorization: `Apikey ${apiKey}` };
}

function buildWebhookPayload(overrides: Record<string, unknown> = {}) {
  const paymentReference = 'PAY-REF-SEPAY-001';
  const transferContent = buildTransferContent(paymentReference);
  return {
    id: 92704,
    gateway: 'Vietcombank',
    transactionDate: '2024-07-02 11:08:33',
    accountNumber: TEST_CONFIG.bankAccount,
    content: transferContent,
    transferType: 'in',
    transferAmount: 100000,
    referenceCode: 'FT24012345678',
    ...overrides,
  };
}

describe('SePayProvider', () => {
  let provider: SePayProvider;

  beforeEach(() => {
    provider = buildProvider();
  });

  describe('createPayment', () => {
    it('generates bank QR with amount and CARDON transfer content', async () => {
      const expiresAt = new Date('2026-06-18T12:00:00.000Z');
      const result = await provider.createPayment({
        paymentReference: 'PAY-REF-SEPAY-001',
        amount: '100000.00',
        orderId: 'order-1',
        gateway: PaymentGatewayCode.SEPAY,
        expiresAt,
      });

      expect(result.paymentUrl).toContain('https://qr.sepay.vn/img');
      expect(result.paymentUrl).toContain('acc=1017588888');
      expect(result.paymentUrl).toContain('bank=Vietcombank');
      expect(result.paymentUrl).toContain('amount=100000');
      expect(result.paymentUrl).toContain('des=CARDON');
      expect(result.paymentUrl).toContain('PAY-REF-SEPAY-001');
      expect(result.rawResponse.qr_url).toBe(result.paymentUrl);
      expect(result.rawResponse.bank_info).toEqual({
        bankCode: 'Vietcombank',
        accountNumber: '1017588888',
        accountName: 'CARDON COMPANY',
      });
      expect(result.rawResponse.amount).toBe(100000);
      expect(result.rawResponse.transferContent).toBe(
        'CARDON PAY-REF-SEPAY-001',
      );
      expect(result.rawResponse.expired_at).toBe(expiresAt.toISOString());
    });

    it('uses bare DH code as transfer content for SePay payment-code filters', async () => {
      const result = await provider.createPayment({
        paymentReference: 'DH12345678',
        amount: '50000.00',
        orderId: 'order-dh',
        gateway: PaymentGatewayCode.SEPAY,
      });

      expect(result.rawResponse.transferContent).toBe('DH12345678');
      expect(result.paymentUrl).toContain('des=DH12345678');
    });
  });

  describe('verifyWebhook — payment gateway IPN', () => {
    const pgConfig = {
      mode: 'payment_gateway' as const,
      merchantId: 'SP-TEST-CT4BB234',
      merchantSecretKey: 'spsk_test_secret',
      ipnSecretKey: 'ipn-secret-key',
      environment: 'sandbox' as const,
      paymentMethod: 'BANK_TRANSFER' as const,
      publicUrl: 'https://cardon.vn',
    };

    function buildPgProvider() {
      const configService = {
        getConfig: () => pgConfig,
        isConfigured: () => true,
      } as unknown as SepayConfigService;
      return new SePayProvider(configService);
    }

    it('accepts ORDER_PAID IPN with X-Secret-Key', async () => {
      const provider = buildPgProvider();
      const result = await provider.verifyWebhook(
        {
          notification_type: 'ORDER_PAID',
          order: {
            order_invoice_number: 'PAY-PG-001',
            order_amount: '100000.00',
          },
          transaction: {
            transaction_id: 'tx-pg-001',
            transaction_status: 'APPROVED',
          },
        },
        { 'X-Secret-Key': 'ipn-secret-key' },
      );

      expect(result.valid).toBe(true);
      expect(result.paymentReference).toBe('PAY-PG-001');
      expect(result.status).toBe('SUCCESS');
      expect(result.amount).toBe('100000.00');
    });
  });

  describe('createPayment — payment gateway', () => {
    it('returns checkout form fields for sandbox PG', async () => {
      const configService = {
        getConfig: () => ({
          mode: 'payment_gateway' as const,
          merchantId: 'SP-TEST-CT4BB234',
          merchantSecretKey: 'spsk_test_secret',
          ipnSecretKey: 'ipn-secret-key',
          environment: 'sandbox' as const,
          paymentMethod: 'BANK_TRANSFER' as const,
          publicUrl: 'https://cardon.vn',
        }),
        isConfigured: () => true,
      } as unknown as SepayConfigService;
      const provider = new SePayProvider(configService);

      const result = await provider.createPayment({
        paymentReference: 'PAY-PG-002',
        amount: '50000.00',
        orderId: 'order-pg-1',
        gateway: PaymentGatewayCode.SEPAY,
      });

      expect(result.paymentUrl).toContain('pay-sandbox.sepay.vn');
      expect(result.rawResponse.checkoutFormFields).toBeDefined();
      expect(
        (result.rawResponse.checkoutFormFields as Record<string, string>)
          .order_invoice_number,
      ).toBe('PAY-PG-002');
    });

    it('preferLegacyQr forces QR even when mode is payment_gateway', async () => {
      const configService = {
        getConfig: () => ({
          mode: 'payment_gateway' as const,
          merchantId: 'SP-TEST-CT4BB234',
          merchantSecretKey: 'spsk_test_secret',
          ipnSecretKey: 'ipn-secret-key',
          environment: 'sandbox' as const,
          paymentMethod: 'BANK_TRANSFER' as const,
          publicUrl: 'https://cardon.vn',
          bankAccount: '1017588888',
          bankCode: 'Vietcombank',
          accountName: 'CARDON COMPANY',
          qrTemplate: 'compact',
        }),
        isConfigured: () => true,
      } as unknown as SepayConfigService;
      const provider = new SePayProvider(configService);

      const result = await provider.createPayment({
        paymentReference: 'DH87654321',
        amount: '100000.00',
        orderId: 'DH87654321',
        gateway: PaymentGatewayCode.SEPAY,
        preferLegacyQr: true,
      });

      expect(result.rawResponse.integrationMode).toBe('legacy_qr');
      expect(result.paymentUrl).toContain('qr.sepay.vn');
      expect(result.rawResponse.transferContent).toBe('DH87654321');
      expect(result.rawResponse.bank_info).toEqual({
        bankCode: 'Vietcombank',
        accountNumber: '1017588888',
        accountName: 'CARDON COMPANY',
      });
    });
  });

  describe('verifyWebhook', () => {
    it('accepts valid webhook with API key and matches payment_reference', async () => {
      const payload = buildWebhookPayload();
      const result = await provider.verifyWebhook(payload, authHeader());

      expect(result.valid).toBe(true);
      expect(result.paymentReference).toBe('PAY-REF-SEPAY-001');
      expect(result.status).toBe('SUCCESS');
      expect(result.amount).toBe('100000.00');
      expect(result.providerTransactionId).toBe('92704');
      expect(result.unknownReference).toBeFalsy();
    });

    it('rejects invalid authorization token', async () => {
      const payload = buildWebhookPayload();
      const result = await provider.verifyWebhook(payload, {
        Authorization: 'Apikey wrong-key',
      });

      expect(result.valid).toBe(false);
    });

    it('flags unknown reference without failing verification', async () => {
      const payload = buildWebhookPayload({
        content: 'NGUYEN VAN A chuyen tien khong co ma',
        code: null,
      });
      const result = await provider.verifyWebhook(payload, authHeader());

      expect(result.valid).toBe(true);
      expect(result.paymentReference).toBe('');
      expect(result.unknownReference).toBe(true);
      expect(result.status).toBe('PENDING');
    });

    it('accepts HMAC webhook secret when raw body provided', async () => {
      const payload = buildWebhookPayload({ id: 55555 });
      const rawBody = JSON.stringify(payload);
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = createHmac('sha256', TEST_CONFIG.webhookSecret)
        .update(`${timestamp}.${rawBody}`)
        .digest('hex');

      const result = await provider.verifyWebhook(payload, {
        'X-SePay-Signature': `sha256=${signature}`,
        'X-SePay-Timestamp': timestamp,
        'x-sepay-raw-body': rawBody,
      });

      expect(result.valid).toBe(true);
      expect(result.paymentReference).toBe('PAY-REF-SEPAY-001');
    });

    it('rejects HMAC when timestamp skew exceeds 5 minutes', async () => {
      const payload = buildWebhookPayload({ id: 55556 });
      const rawBody = JSON.stringify(payload);
      const timestamp = String(Math.floor(Date.now() / 1000) - 600);
      const signature = createHmac('sha256', TEST_CONFIG.webhookSecret)
        .update(`${timestamp}.${rawBody}`)
        .digest('hex');

      const result = await provider.verifyWebhook(payload, {
        'X-SePay-Signature': `sha256=${signature}`,
        'X-SePay-Timestamp': timestamp,
        'x-sepay-raw-body': rawBody,
      });

      expect(result.valid).toBe(false);
    });

    it('extracts DH payment codes from SePay code/content', async () => {
      const payload = buildWebhookPayload({
        id: 777,
        code: 'DH12345678',
        content: 'DH12345678 chuyen khoan',
      });
      const rawBody = JSON.stringify(payload);
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = createHmac('sha256', TEST_CONFIG.webhookSecret)
        .update(`${timestamp}.${rawBody}`)
        .digest('hex');

      const result = await provider.verifyWebhook(payload, {
        'X-SePay-Signature': `sha256=${signature}`,
        'X-SePay-Timestamp': timestamp,
        'x-sepay-raw-body': rawBody,
      });

      expect(result.valid).toBe(true);
      expect(result.paymentReference).toBe('DH12345678');
    });
  });

  describe('queryTransaction', () => {
    it('returns foundation PENDING status for reconciliation', async () => {
      const result = await provider.queryTransaction('PAY-REF-SEPAY-001');
      expect(result.paymentReference).toBe('PAY-REF-SEPAY-001');
      expect(result.status).toBe('PENDING');
    });
  });

  describe('refund', () => {
    it('returns placeholder not implemented', async () => {
      const result = await provider.refund('PAY-REF-SEPAY-001');
      expect(result.success).toBe(false);
      expect(result.message).toContain('not implemented');
    });
  });
});

describe('SePayProvider — PaymentService integration scenarios', () => {
  let provider: SePayProvider;

  beforeEach(() => {
    provider = buildProvider();
  });

  it('wrong amount is exposed for PaymentService validation', async () => {
    const payload = buildWebhookPayload({ transferAmount: 90000 });
    const result = await provider.verifyWebhook(payload, authHeader());

    expect(result.valid).toBe(true);
    expect(result.amount).toBe('90000.00');
    expect(result.status).toBe('SUCCESS');
  });

  it('duplicate transaction id is stable across retries', async () => {
    const payload = buildWebhookPayload({ id: 92704 });
    const first = await provider.verifyWebhook(payload, authHeader());
    const second = await provider.verifyWebhook(payload, authHeader());

    expect(first.providerTransactionId).toBe('92704');
    expect(second.providerTransactionId).toBe('92704');
  });
});
