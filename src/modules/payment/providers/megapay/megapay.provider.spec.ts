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
  secretKey: '31feae316de0a42520ef5ec4',
  endpoint:
    'https://sandboxva.ecollect.vn:10003/ApiResf_VirtualAccount/services/registerVA',
  returnUrl: 'https://cardon.vn/checkout/result',
  webhookSecret: 'unused',
  callbackUrl: 'https://cardon.vn/api/v1/payments/webhook/megapay',
  bankCode: 'WOORIBANK',
  notifyPublicKey: publicKey,
};

function buildProvider(fetchMock: jest.Mock): MegaPayProvider {
  const configService = {
    getConfig: () => TEST_CONFIG,
    isConfigured: () => true,
  } as unknown as MegapayConfigService;
  const httpClient = new DepositCodeHttpClient(configService, fetchMock);
  return new MegaPayProvider(configService, httpClient);
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

  beforeEach(() => {
    fetchMock = jest.fn();
    provider = buildProvider(fetchMock);
  });

  describe('createPayment', () => {
    it('registers VA and returns QR paymentUrl + bank_info', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            response_code: '00',
            message: 'Thanh cong',
            account_no: '902000229207',
            account_name: 'VNEP VAP001 CARDON',
            bank_code: 'WOORIBANK',
            bank_name: 'WOORIBANK',
            map_id: 'PAY-REF-001',
            qr_url: 'https://qr.example/PAY-REF-001',
            amount: 100000,
          }),
      });

      const result = await provider.createPayment({
        paymentReference: 'PAY-REF-001',
        amount: '100000',
        orderId: 'order-1',
        gateway: PaymentGatewayCode.MEGAPAY,
      });

      expect(result.paymentUrl).toBe('https://qr.example/PAY-REF-001');
      expect(result.providerReference).toBe('902000229207');
      expect(result.rawResponse.bank_info).toEqual({
        bankCode: 'WOORIBANK',
        accountNumber: '902000229207',
        accountName: 'VNEP VAP001 CARDON',
      });

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('registerVA');
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.pcode).toBe('9000');
      expect(body.merchant_code).toBe('VAP001');
      expect(typeof body.data).toBe('string');
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
  });
});
