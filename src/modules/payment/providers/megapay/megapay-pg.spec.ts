import { createHash } from 'crypto';
import {
  buildMegapayPgCancelTokens,
  buildMegapayPgRequestToken,
  buildMegapayPgStatusToken,
  formatVaDate,
  getMegapayPgClientAssets,
  getMegapayPgApiUrls,
} from './megapay-pg';

describe('MegaPay PG V1.4.6 helpers', () => {
  it('formats VA dates in Vietnam time regardless of server timezone', () => {
    // Container production chạy UTC; MegaPay đọc theo GMT+7.
    expect(formatVaDate(new Date('2026-07-30T13:27:02Z'))).toBe('20260730202702');
    expect(formatVaDate(new Date('2026-07-30T17:30:00Z'))).toBe('20260731003000');
  });

  it('uses pg.megapay.vn for production assets and APIs', () => {
    const assets = getMegapayPgClientAssets('production');
    const apis = getMegapayPgApiUrls('production');
    expect(assets.domain).toBe('https://pg.megapay.vn');
    expect(assets.jsUrl).toContain('pg.megapay.vn');
    expect(assets.cssUrl).toContain('pg.megapay.vn');
    expect(apis.trxStatusUrl).toBe(
      'https://pg.megapay.vn/pg_was/order/trxStatus.do',
    );
    expect(apis.paymentCancelUrl).toBe(
      'https://pg.megapay.vn/pg_was/cancel/paymentCancel.do',
    );
  });

  it('builds status and cancel tokens per MegaPay samplePage formulas', () => {
    const encodeKey = 'test-encode-key';
    const status = buildMegapayPgStatusToken({
      timeStamp: '1710000000000',
      merTrxId: 'PAY-1',
      merId: 'CARDON0001',
      encodeKey,
    });
    expect(status).toBe(
      createHash('sha256')
        .update('1710000000000PAY-1CARDON0001' + encodeKey, 'utf8')
        .digest('hex'),
    );

    const cancel = buildMegapayPgCancelTokens({
      timeStamp: '1710000000000',
      merTrxId: 'PAY-1',
      trxId: 'TRX-9',
      merId: 'CARDON0001',
      amount: '10000',
      encodeKey,
      refundPassword: 'refund-pw',
    });
    expect(cancel.merchantToken).toBe(
      createHash('sha256')
        .update('1710000000000PAY-1TRX-9CARDON000110000' + encodeKey, 'utf8')
        .digest('hex'),
    );
    expect(cancel.hash).toBe(
      createHash('sha256')
        .update('PAY-1refund-pw' + encodeKey, 'utf8')
        .digest('hex'),
    );

    const request = buildMegapayPgRequestToken({
      timeStamp: '1',
      merTrxId: 'PAY-1',
      merId: 'CARDON0001',
      amount: '1000',
      encodeKey,
    });
    expect(request).toHaveLength(64);
  });
});
