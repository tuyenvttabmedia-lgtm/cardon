import { normalizePem } from './pem.util';

describe('normalizePem', () => {
  it('wraps raw SPKI base64 without PEM headers', () => {
    const body =
      'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAheCFtMZKQ/hiHdMAlJJr6xJkShe7D/l4' +
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
      'joAQnwIDAQAB';
    const pem = normalizePem(body);
    expect(pem).toContain('-----BEGIN PUBLIC KEY-----');
    expect(pem).toContain('-----END PUBLIC KEY-----');
    expect(pem).toContain(body.slice(0, 64));
  });

  it('leaves already-valid PEM unchanged (aside from trim)', () => {
    const input = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA
-----END PUBLIC KEY-----`;
    expect(normalizePem(input)).toBe(input);
  });
});
