import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * W2 deferred order abuse; W5 adds fail-open order_create only.
 * Payment paths must remain free of AbuseRateLimit / Turnstile.
 */
describe('W2/W5 isolation — POST /orders abuse scope', () => {
  const orderCtrl = join(__dirname, 'controllers/order.controller.ts');
  const paymentCtrl = join(
    __dirname,
    '../payment/controllers/payment.controller.ts',
  );

  it('order create uses consumeFailOpen (not fail-closed consumeOrThrow)', () => {
    const source = readFileSync(orderCtrl, 'utf8');
    expect(source).toContain('consumeFailOpen');
    expect(source).toContain("bucket: 'order_create'");
    expect(source).not.toMatch(/consumeOrThrow\(/);
  });

  it('payment controller has no AbuseRateLimit', () => {
    const source = readFileSync(paymentCtrl, 'utf8');
    expect(source).not.toContain('AbuseRateLimit');
    expect(source).not.toContain('consumeFailOpen');
  });
});
