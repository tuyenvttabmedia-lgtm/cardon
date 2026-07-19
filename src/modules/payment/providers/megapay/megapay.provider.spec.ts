/**
 * Phase 2E.2 — MegaPay Payment Adapter Tests
 */
import { PaymentGatewayCode } from '@prisma/client';
import { MegapayHttpClient } from './megapay.client';
import { MegapayConfigService } from './megapay.config';
import { MegaPayProvider } from './megapay.provider';
import { signMegapayRequest, toSignableFields } from './megapay.signature';

const TEST_CONFIG = {
  merchantId: 'merchant-test',
  secretKey: 'megapay-secret-key',
  endpoint: 'https://api.megapay.test',
  returnUrl: 'https://cardon.vn/payment/return',
  webhookSecret: 'megapay-webhook-secret',
  callbackUrl: 'https://cardon.vn/api/v1/payments/webhook/megapay',
};

function buildProvider(fetchMock: jest.Mock): MegaPayProvider {
  const configService = {
    getConfig: () => TEST_CONFIG,
    isConfigured: () => true,
  } as unknown as MegapayConfigService;
  const httpClient = new MegapayHttpClient(configService, fetchMock);
  return new MegaPayProvider(configService, httpClient);
}

function signWebhook(
  payload: Record<string, string | number>,
): string {
  return signMegapayRequest(toSignableFields(payload), TEST_CONFIG.webhookSecret);
}

describe('MegaPayProvider', () => {
  let fetchMock: jest.Mock;
  let provider: MegaPayProvider;

  beforeEach(() => {
    fetchMock = jest.fn();
    provider = buildProvider(fetchMock);
  });

  describe('createPayment', () => {
    it('maps payment_reference to MegaPay order_id and returns payment URL', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          request_id: 'req-001',
          order_id: 'PAY-REF-001',
          payment_url: 'https://pay.megapay.test/checkout/PAY-REF-001',
          status: 'PENDING',
        }),
      });

      const result = await provider.createPayment({
        paymentReference: 'PAY-REF-001',
        amount: '100000',
        orderId: 'order-1',
        gateway: PaymentGatewayCode.MEGAPAY,
      });

      expect(result.paymentUrl).toBe(
        'https://pay.megapay.test/checkout/PAY-REF-001',
      );
      expect(result.providerReference).toBe('PAY-REF-001');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.megapay.test/v1/checkout/create');
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.order_id).toBe('PAY-REF-001');
      expect(body.amount).toBe(100000);
      expect(body.return_url).toBe(TEST_CONFIG.returnUrl);
      expect(body.callback_url).toBe(TEST_CONFIG.callbackUrl);
      expect(body.merchant_id).toBe(TEST_CONFIG.merchantId);
      expect(typeof body.signature).toBe('string');
      expect(body.signature).not.toBe('');
    });
  });

  describe('verifyWebhook', () => {
    it('accepts valid webhook signature', async () => {
      const payload = {
        order_id: 'PAY-REF-001',
        status: 'SUCCESS',
        amount: '100000.00',
        request_id: 'req-wh-1',
      };
      const signature = signWebhook(payload);

      const result = await provider.verifyWebhook(
        { ...payload, signature },
        {},
      );

      expect(result.valid).toBe(true);
      expect(result.paymentReference).toBe('PAY-REF-001');
      expect(result.status).toBe('SUCCESS');
      expect(result.amount).toBe('100000.00');
    });

    it('rejects invalid webhook signature', async () => {
      const result = await provider.verifyWebhook(
        {
          order_id: 'PAY-REF-001',
          status: 'SUCCESS',
          amount: '100000.00',
          signature: 'invalid-signature',
        },
        {},
      );

      expect(result.valid).toBe(false);
    });

    it('maps SUCCESS webhook to SUCCESS status', async () => {
      const payload = { order_id: 'PAY-1', status: 'SUCCESS' };
      const result = await provider.verifyWebhook(
        { ...payload, signature: signWebhook(payload) },
        {},
      );
      expect(result.status).toBe('SUCCESS');
    });

    it('maps FAILED webhook to FAILED status', async () => {
      const payload = { order_id: 'PAY-1', status: 'FAILED' };
      const result = await provider.verifyWebhook(
        { ...payload, signature: signWebhook(payload) },
        {},
      );
      expect(result.status).toBe('FAILED');
    });

    it('maps PENDING/UNKNOWN webhook to PENDING (no final action)', async () => {
      for (const status of ['PENDING', 'UNKNOWN']) {
        const payload = { order_id: 'PAY-1', status };
        const result = await provider.verifyWebhook(
          { ...payload, signature: signWebhook(payload) },
          {},
        );
        expect(result.status).toBe('PENDING');
      }
    });
  });

  describe('queryTransaction', () => {
    it('queries MegaPay and maps transaction status', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          order_id: 'PAY-REF-001',
          amount: '100000.00',
          status: 'SUCCESS',
          request_id: 'req-q-1',
        }),
      });

      const result = await provider.queryTransaction('PAY-REF-001');

      expect(result.paymentReference).toBe('PAY-REF-001');
      expect(result.status).toBe('SUCCESS');
      expect(result.amount).toBe('100000.00');

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toContain('/v1/checkout/query');
      expect(url).toContain('order_id=PAY-REF-001');
      expect(url).toContain('signature=');
    });
  });

  describe('refund', () => {
    it('returns placeholder not implemented', async () => {
      const result = await provider.refund('PAY-REF-001');
      expect(result.success).toBe(false);
      expect(result.message).toContain('not implemented');
    });
  });
});

describe('MegaPay signature', () => {
  it('produces deterministic HMAC-SHA256 hex signatures', () => {
    const fields = { merchant_id: 'm1', order_id: 'PAY-1', amount: 100 };
    const sig1 = signMegapayRequest(fields, 'secret');
    const sig2 = signMegapayRequest(fields, 'secret');
    expect(sig1).toBe(sig2);
    expect(sig1).toMatch(/^[a-f0-9]{64}$/);
  });
});
