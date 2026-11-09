import { readFileSync } from 'fs';
import { join } from 'path';

describe('Payment webhook isolation (W2)', () => {
  it('applies @SkipThrottle on webhook and eSIM SePay IPN', () => {
    const source = readFileSync(
      join(__dirname, 'controllers/payment.controller.ts'),
      'utf8',
    );
    expect(source).toContain('@SkipThrottle()');
    const ipnIdx = source.indexOf("Post('ipn/esim/sepay')");
    const whIdx = source.indexOf("Post('webhook/:gateway')");
    expect(ipnIdx).toBeGreaterThan(-1);
    expect(whIdx).toBeGreaterThan(-1);
    expect(source.slice(ipnIdx, ipnIdx + 120)).toContain('@SkipThrottle()');
    expect(source.slice(whIdx, whIdx + 120)).toContain('@SkipThrottle()');
  });

  it('does not import AbuseRateLimitService into payment controller', () => {
    const source = readFileSync(
      join(__dirname, 'controllers/payment.controller.ts'),
      'utf8',
    );
    expect(source).not.toContain('AbuseRateLimit');
  });
});
