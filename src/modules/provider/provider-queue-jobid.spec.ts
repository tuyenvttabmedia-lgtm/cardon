import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '../../..');

describe('provider/topup queue stable job ids', () => {
  it('uses orderId-stable fulfill job ids without Date.now()', () => {
    const provider = readFileSync(
      join(root, 'src/modules/provider/services/provider-queue.producer.ts'),
      'utf8',
    );
    const topup = readFileSync(
      join(root, 'src/modules/provider/services/topup-queue.producer.ts'),
      'utf8',
    );

    expect(provider).toContain('const jobId = `fulfill-${orderId}`');
    expect(provider).toContain('const jobId = `retry-${orderId}`');
    expect(provider).not.toContain('retry-${orderId}-${attempt}');
    expect(provider).toContain('removeOnComplete: true');
    expect(provider).toContain('isJobIdExistsError');
    expect(provider).not.toContain('Date.now()');

    expect(topup).toContain('const jobId = `topup-fulfill-${orderId}`');
    expect(topup).toContain('const jobId = `topup-retry-${orderId}`');
    expect(topup).toContain('const jobId = `topup-check-${orderId}`');
    expect(topup).not.toContain('topup-retry-${orderId}-${attempt}');
    expect(topup).toContain('removeOnComplete: true');
    expect(topup).not.toContain('Date.now()');
  });
});
