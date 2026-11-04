import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '../../..');

describe('LPA-16K11 payment / queue / worker boundary', () => {
  it('marks PAID inside the payment transaction and enqueues only after commit', () => {
    const payment = readFileSync(join(root, 'src/modules/payment/services/payment.service.ts'), 'utf8');
    const atomic = payment.slice(
      payment.indexOf('private async processSuccessWebhookAtomically'),
      payment.indexOf('private async processFailedWebhookAtomically'),
    );
    expect(atomic).toContain('claimPendingStatus');
    expect(atomic).toContain('markPaidInTransaction');
    expect(atomic).not.toContain('dispatchOrderFulfillment');
    expect(atomic).not.toContain('enqueueFulfillment');

    const webhookSuccess = payment.slice(
      payment.indexOf('if (nextStatus === PaymentRecordStatus.SUCCESS)'),
      payment.indexOf('await this.notificationService.notifyPaymentSuccess'),
    );
    expect(webhookSuccess.indexOf('processSuccessWebhookAtomically')).toBeLessThan(
      webhookSuccess.indexOf('dispatchOrderFulfillment'),
    );
    expect(webhookSuccess).toContain("dispatchOrderFulfillment");
    expect(webhookSuccess).toContain("'webhook'");
  });

  it('worker still does not read paymentStatus; fulfill() claims PENDING before first CREATE', () => {
    const worker = readFileSync(join(root, 'src/modules/esim/esim.worker.ts'), 'utf8');
    const fulfill = readFileSync(join(root, 'src/modules/esim/esim-fulfillment.service.ts'), 'utf8');
    expect(worker).toContain('this.fulfillment.fulfill');
    expect(worker).toContain('queryOpenCreateRecovery');
    expect(worker.indexOf('QUERY_OPEN')).toBeLessThan(worker.indexOf('this.fulfillment.fulfill'));
    expect(worker).not.toContain('createOrder');
    expect(worker).not.toContain('paymentStatus');

    const start = fulfill.slice(fulfill.indexOf('async fulfill('), fulfill.indexOf('if (quote.providerMode === \'LIVE\')'));
    expect(start).toContain('resumeExistingCreate');
    expect(start).toContain('refuseFirstCreateIfBlocked');
    expect(start).not.toContain('paymentStatus');
    expect(fulfill).toContain('claimFirstCreate');
    expect(fulfill).toContain('FulfillmentStatus.PENDING');
    expect(fulfill).toContain('FulfillmentStatus.PROCESSING');
  });

  it('paid-order watchdog alerts eSIM PENDING and never enqueues', () => {
    const watchdog = readFileSync(
      join(root, 'src/modules/operations-center/services/paid-order-watchdog.service.ts'),
      'utf8',
    );
    expect(watchdog).toContain('order_fulfillment_esim_pending');
    expect(watchdog).toContain('Không tự gọi nhà cung cấp');
    expect(watchdog).not.toContain('enqueueFulfillment');
    expect(watchdog).not.toContain('dispatchOrderFulfillment');
    expect(watchdog).not.toContain('esim_queue');
  });

  it('esim job id is stable and duplicate add is treated as the same job', () => {
    const producer = readFileSync(join(root, 'src/modules/esim/esim-queue.producer.ts'), 'utf8');
    expect(producer).toContain('const jobId = `esim-fulfill-${orderId}`');
    const queryOpen = producer.slice(
      producer.indexOf('async enqueueQueryOpen'),
      producer.length,
    );
    expect(producer).toContain('const jobId = `esim-query-open-${orderId}`');
    expect(producer).toContain('ESIM_QUEUE_JOB.QUERY_OPEN');
    expect(producer).toContain('attempts: 1');
    expect(queryOpen).toContain('removeOnComplete: true');
    expect(queryOpen).toContain('removeOnFail: true');
    expect(queryOpen).not.toContain('enqueueFulfillment');
    expect(producer).toContain("message.toLowerCase().includes('exist')");
    expect(producer).not.toContain('createOrder');
  });
});
