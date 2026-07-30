import { MegapayPgHttpClient } from './megapay-pg.client';
import { MegapayConfigService } from './megapay.config';

describe('MegapayPgHttpClient', () => {
  const configService = {
    getConfig: () => ({
      merchantId: 'CARDON0001',
      pgMerchantId: 'CARDON0001',
      pgEncodeKey: 'test-key',
      pgEnvironment: 'production',
    }),
  } as unknown as MegapayConfigService;

  it('reads transaction status from the nested trxStatus data object', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          resultCd: '00_000',
          data: {
            trxId: 'MEGAPAY-TRX-1',
            merId: 'CARDON0001',
            merTrxId: 'PAY-1',
            invoiceNo: 'PAY-1',
            amount: '20154',
            payType: 'QR',
            resultCd: '99',
            resultMsg: 'Giao dịch đang chờ xử lý',
            status: '-2',
          },
        }),
        { status: 200 },
      ),
    );
    const client = new MegapayPgHttpClient(configService, fetchMock);

    const result = await client.queryByMerTrxId('PAY-1');

    expect(result).toMatchObject({
      resultCd: '99',
      resultMsg: 'Giao dịch đang chờ xử lý',
      trxId: 'MEGAPAY-TRX-1',
      merTrxId: 'PAY-1',
      amount: '20154',
      payType: 'QR',
    });
  });
});
