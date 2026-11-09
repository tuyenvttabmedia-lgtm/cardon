import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Guardrail: Turnstile allowed on auth/ticket/guest-order only — never payment/webhook/IPN.
 */
describe('Turnstile scope guardrail (W3+W5)', () => {
  const root = join(__dirname, '../..');

  function read(rel: string): string {
    return readFileSync(join(root, rel), 'utf8');
  }

  it('payment controller has no Turnstile import', () => {
    const src = read('modules/payment/controllers/payment.controller.ts');
    expect(src).not.toMatch(/turnstile/i);
    expect(src).not.toMatch(/captchaToken/i);
  });

  it('order controller Turnstile is guest-order scoped', () => {
    const text = read('modules/order/controllers/order.controller.ts');
    expect(text).toMatch(/TurnstileService/);
    expect(text).toMatch(/TURNSTILE_ACTION_GUEST_ORDER/);
    expect(text).toMatch(/isGuest/);
  });

  it('payment webhook/IPN controller has no Turnstile', () => {
    const text = read('modules/payment/controllers/payment.controller.ts');
    expect(text).not.toMatch(/TurnstileService|turnstile\.service|captchaToken/i);
  });
});
