import { describe, expect, it } from 'vitest';
import {
  buildVietQrPayload,
  crc16CcittFalse,
  normalizeVndAmount,
  resolveNapasBin,
} from './vietqr';

describe('resolveNapasBin', () => {
  it('maps Kookmin Hanoi (MegaPay EPAY VA)', () => {
    expect(resolveNapasBin(null, 'KOOKMIN BANK CN HN')).toBe('970462');
    expect(resolveNapasBin('KBHN', null)).toBe('970462');
  });

  it('maps Kookmin HCMC separately', () => {
    expect(resolveNapasBin(null, 'KOOKMIN BANK CN HCM')).toBe('970463');
  });

  it('returns null when bank is unknown', () => {
    expect(resolveNapasBin(null, 'UNKNOWN BANK XYZ')).toBeNull();
  });
});

describe('buildVietQrPayload', () => {
  it('builds a dynamic VietQR with CRC for MegaPay VA fields', () => {
    const payload = buildVietQrPayload({
      accountNumber: '811090254635084',
      bankName: 'KOOKMIN BANK CN HN',
      amount: '20000',
      addInfo: 'PAY-C6D0AC2341FF4E56B5F0',
    });
    expect(payload).toBeTruthy();
    expect(payload!.startsWith('000201010212')).toBe(true);
    expect(payload).toContain('970462');
    expect(payload).toContain('811090254635084');
    expect(payload).toContain('20000');
    expect(payload).toContain('PAY-C6D0AC2341FF4E56B5F0');
    expect(payload!.slice(-4)).toBe(crc16CcittFalse(payload!.slice(0, -4)));
  });

  it('refuses to build when memo would need truncation', () => {
    expect(
      buildVietQrPayload({
        accountNumber: '811090254635084',
        bankName: 'KOOKMIN BANK CN HN',
        amount: 20000,
        addInfo: 'PAY-THIS-MEMO-IS-WAY-TOO-LONG-FOR-NAPAS',
      }),
    ).toBeNull();
  });

  it('refuses without resolvable BIN', () => {
    expect(
      buildVietQrPayload({
        accountNumber: '811090254635084',
        bankName: 'Mystery Bank',
        amount: 20000,
        addInfo: 'PAY-ABC',
      }),
    ).toBeNull();
  });
});

describe('normalizeVndAmount', () => {
  it('rounds numeric strings', () => {
    expect(normalizeVndAmount('20000.00')).toBe(20000);
    expect(normalizeVndAmount(19999.6)).toBe(20000);
  });
});
