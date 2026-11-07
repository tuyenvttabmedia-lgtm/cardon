import {
  isLocalWebhookHost,
  isProductionCardonHost,
  resolveLocalWebhookTestUrl,
} from './webhook-test-url';

describe('webhook-test-url', () => {
  it('rewrites localhost webhook to the in-process API', () => {
    expect(
      resolveLocalWebhookTestUrl(
        'http://localhost/api/v1/payments/webhook/sepay',
      ),
    ).toBe('http://127.0.0.1:3000/api/v1/payments/webhook/sepay');
  });

  it('leaves public URLs unchanged', () => {
    expect(
      resolveLocalWebhookTestUrl(
        'https://cardon.vn/api/v1/payments/webhook/sepay',
      ),
    ).toBe('https://cardon.vn/api/v1/payments/webhook/sepay');
  });

  it('detects local and production hosts', () => {
    expect(isLocalWebhookHost('localhost')).toBe(true);
    expect(isProductionCardonHost('cardon.vn')).toBe(true);
    expect(isProductionCardonHost('localhost')).toBe(false);
  });
});
