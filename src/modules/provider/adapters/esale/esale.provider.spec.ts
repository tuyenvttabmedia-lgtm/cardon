import {
  constants,
  generateKeyPairSync,
  publicEncrypt,
} from 'crypto';
import { ConfigService } from '@nestjs/config';
import { ProviderTransactionStatus } from '@prisma/client';
import { SettingsEncryptionService } from '../../../settings/services/settings-encryption.service';
import { SettingsRepository } from '../../../settings/repositories/settings.repository';
import { SettingsStoreService } from '../../../settings/services/settings-store.service';
import { EsaleConfigService } from './esale.config';
import { EsaleHttpClient } from './esale.client';
import { EsaleCardAdapter } from './esale-card.adapter';
import { EsaleTopupAdapter } from './esale-topup.adapter';
import { ESaleProvider } from './esale.provider';
import {
  sha256Hex,
  signBuyCardRequest,
  decryptCardPin,
} from './esale.signature';
import { parseProviderProductCode } from './esale.mapper';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

const CLIENT_PRIVATE_KEY = privateKey.export({
  type: 'pkcs8',
  format: 'pem',
}) as string;

const CLIENT_PUBLIC_KEY = publicKey.export({
  type: 'spki',
  format: 'pem',
}) as string;

function encryptPinForEsale(pin: string): string {
  const encrypted = publicEncrypt(
    {
      key: CLIENT_PUBLIC_KEY,
      padding: constants.RSA_PKCS1_PADDING,
    },
    Buffer.from(pin, 'utf8'),
  );
  return encrypted.toString('base64');
}

function buildConfigService(): ConfigService {
  return {
    get: (key: string) => {
      const values: Record<string, unknown> = {
        'esale.cardApiUrl': 'https://esale.test/cardshop',
        'esale.topupApiUrl': 'https://esale.test/topup',
        'esale.agencyCode': '9014780450',
        'esale.clientCode': 'client_test',
        'esale.secretKey': 'test-secret-key',
        'esale.privateKey': CLIENT_PRIVATE_KEY,
        'esale.publicKey': CLIENT_PUBLIC_KEY,
        'esale.timeoutMs': 5000,
        'esale.verifyResponseSignature': false,
        'esale.defaultCardType': 'Card',
      };
      return values[key];
    },
  } as ConfigService;
}

function buildSettingsStore(configService: ConfigService): SettingsStoreService {
  const encryption = new SettingsEncryptionService({
    get: () => 'test-encryption-key-32chars-min!!',
  } as unknown as ConfigService);
  const repository = {
    findAll: jest.fn().mockResolvedValue([]),
  } as unknown as SettingsRepository;
  return new SettingsStoreService(repository, encryption, configService);
}

function buildProvider(
  fetchImpl: EsaleHttpClient['fetchFn'] extends infer T ? T : never,
): ESaleProvider {
  const nestConfig = buildConfigService();
  const settingsStore = buildSettingsStore(nestConfig);
  const configService = new EsaleConfigService(nestConfig, settingsStore);
  const client = new EsaleHttpClient(configService, fetchImpl);
  const topupAdapter = new EsaleTopupAdapter(configService, client);
  const cardAdapter = new EsaleCardAdapter(configService, client);
  const productSyncService = {
    syncEsaleCardCatalog: jest.fn().mockResolvedValue({ synced: 0, message: 'mock' }),
  } as unknown as import('../../services/provider-product-sync.service').ProviderProductSyncService;
  return new ESaleProvider(configService, client, cardAdapter, topupAdapter, productSyncService);
}

describe('esale.signature', () => {
  it('builds buyCard checkSum per eSale V3 spec', () => {
    const { checkSum } = signBuyCardRequest({
      agencyCode: '9014780450',
      transId: 'REQ-001',
      supplierCode: 'VIETTEL',
      cardId: 35,
      quantity: 1,
      time: '1411984654',
      secretKey: 'secret',
      privateKeyPem: CLIENT_PRIVATE_KEY,
    });

    expect(checkSum).toBe(
      sha256Hex('9014780450|REQ-001|VIETTEL|35|1|1411984654|secret'),
    );
  });

  it('decrypts RSA cardCode with client private key', () => {
    const pin = '12345678901234';
    const encrypted = encryptPinForEsale(pin);
    expect(decryptCardPin(encrypted, CLIENT_PRIVATE_KEY)).toBe(pin);
  });
});

describe('esale.mapper', () => {
  it('parses SUPPLIER:CARD_ID product code', () => {
    expect(parseProviderProductCode('VIETTEL:35')).toEqual({
      supplierCode: 'VIETTEL',
      cardId: 35,
    });
  });
});

describe('ESaleProvider', () => {
  it('returns SUCCESS with decrypted cards on buyCard retCode=1', async () => {
    const encryptedPin = encryptPinForEsale('98765432109876');
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        retCode: 1,
        retMsg: 'Successful',
        data: {
          transId: 'REQ-100',
          eSaleTransId: 'C90000001120',
          cardsList: [
            {
              serial: '2Y00000003089',
              cardCode: encryptedPin,
              expiredDate: '29/12/2026 23:59:59',
            },
          ],
        },
      }),
    });

    const provider = buildProvider(fetchMock);
    const result = await provider.buyCard({
      requestId: 'REQ-100',
      providerProductCode: 'VIETTEL:35',
      quantity: 1,
      orderId: 'order-1',
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe(ProviderTransactionStatus.SUCCESS);
    expect(result.providerTransactionId).toBe('C90000001120');
    expect(result.cards).toHaveLength(1);
    expect(result.cards?.[0].pin).toBe('98765432109876');
    expect(result.cards?.[0].serial).toBe('2Y00000003089');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://esale.test/cardshop/buycard',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('maps retCode -3004 to OUT_OF_STOCK', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        retCode: -3004,
        retMsg: 'Out of stock',
        data: null,
      }),
    });

    const provider = buildProvider(fetchMock);
    const result = await provider.buyCard({
      requestId: 'REQ-OOS',
      providerProductCode: 'VIETTEL:35',
      quantity: 1,
      orderId: 'order-1',
    });

    expect(result.success).toBe(false);
    expect(result.failureCode).toBe('OUT_OF_STOCK');
    expect(result.status).toBe(ProviderTransactionStatus.FAILED);
  });

  it('maps retCode -3000 to LOW_BALANCE', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        retCode: -3000,
        retMsg: 'Balance not enough',
        data: null,
      }),
    });

    const provider = buildProvider(fetchMock);
    const result = await provider.buyCard({
      requestId: 'REQ-LB',
      providerProductCode: 'VIETTEL:35',
      quantity: 1,
      orderId: 'order-1',
    });

    expect(result.failureCode).toBe('LOW_BALANCE');
  });

  it('returns TIMEOUT on HTTP abort', async () => {
    const fetchMock = jest.fn().mockImplementation((_url, init) => {
      const signal = init?.signal as AbortSignal | undefined;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          const error = new Error('Aborted');
          error.name = 'AbortError';
          reject(error);
        });
        setTimeout(() => {
          const error = new Error('Aborted');
          error.name = 'AbortError';
          reject(error);
        }, 20);
      });
    });

    const provider = buildProvider(fetchMock);
    const result = await provider.buyCard({
      requestId: 'REQ-TIMEOUT',
      providerProductCode: 'VIETTEL:35',
      quantity: 1,
      orderId: 'order-1',
    });

    expect(result.status).toBe(ProviderTransactionStatus.TIMEOUT);
    expect(result.failureCode).toBe('TIMEOUT');
  });

  it('recovers via checkTransaction after timeout', async () => {
    const encryptedPin = encryptPinForEsale('1111222233334444');
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          retCode: 99,
          retMsg: 'Processing',
          data: { transId: 'REQ-CHK', eSaleTransId: 'C-PENDING' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          retCode: 1,
          retMsg: 'Successful',
          data: {
            transId: 'REQ-CHK',
            eSaleTransId: 'C-RECOVERED',
            cardsList: [
              {
                serial: 'SN-RECOVERED',
                cardCode: encryptedPin,
                expiredDate: '01/01/2027 00:00:00',
              },
            ],
          },
        }),
      });

    const provider = buildProvider(fetchMock);
    const pending = await provider.buyCard({
      requestId: 'REQ-CHK',
      providerProductCode: 'VIETTEL:35',
      quantity: 1,
      orderId: 'order-1',
    });

    expect(pending.status).toBe(ProviderTransactionStatus.PENDING);

    const recovered = await provider.checkTransaction('REQ-CHK', {
      providerTransactionDate: '2026-06-19 00:00:00',
      providerRequestTime: '1411984654',
      kind: 'CARD',
    });
    expect(recovered.success).toBe(true);
    expect(recovered.providerTransactionId).toBe('C-RECOVERED');
    expect(recovered.cards?.[0].pin).toBe('1111222233334444');
  });

  it('fetches balance via getbalance', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        retCode: 1,
        retMsg: 'Successful',
        data: { agencyCode: '9014780450', balance: 23530720 },
      }),
    });

    const provider = buildProvider(fetchMock);
    const balance = await provider.getBalance();

    expect(balance.balance).toBe(23530720);
    expect(balance.currency).toBe('VND');
  });

  it('returns INVALID_SKU for malformed providerProductCode', async () => {
    const provider = buildProvider(jest.fn());
    const result = await provider.buyCard({
      requestId: 'REQ-BAD',
      providerProductCode: 'INVALID',
      quantity: 1,
      orderId: 'order-1',
    });

    expect(result.failureCode).toBe('INVALID_SKU');
  });

  it('syncProducts counts catalog items from getcardlist', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        retCode: 1,
        retMsg: 'Successful',
        data: {
          info: [
            { cardId: 35, cardCode: 'VT10K', supplierCode: 'VIETTEL' },
            { cardId: 36, cardCode: 'VT20K', supplierCode: 'VIETTEL' },
          ],
        },
      }),
    });

    const provider = buildProvider(fetchMock);
    const sync = await provider.syncProducts();

    expect(sync.synced).toBe(6);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
