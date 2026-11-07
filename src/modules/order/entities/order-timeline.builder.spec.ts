import { FulfillmentStatus, OrderEventType, OrderPaymentStatus, ProductVariantType } from '@prisma/client';
import { buildOrderTimeline } from './order-timeline.builder';

describe('buildOrderTimeline eSIM', () => {
  it('uses eSIM steps and keeps unpaid orders on waiting payment', () => {
    const steps = buildOrderTimeline({
      paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
      fulfillmentStatus: FulfillmentStatus.PENDING,
      variantTypes: [ProductVariantType.ESIM],
      events: [],
    });

    expect(steps.map((step) => step.key)).toEqual(['payment', 'fetch_esim', 'esim_ready', 'completed']);
    expect(steps[0]).toMatchObject({ label: 'Chờ thanh toán', state: 'active' });
    expect(steps[1]).toMatchObject({ label: 'Đang lấy mã cài eSIM', state: 'pending' });
    expect(steps.map((step) => step.label).join(' ')).not.toMatch(/nạp|thẻ/i);
  });

  it('marks paid eSIM as fetching the install code', () => {
    const steps = buildOrderTimeline({
      paymentStatus: OrderPaymentStatus.PAID,
      fulfillmentStatus: FulfillmentStatus.PROCESSING,
      variantTypes: [ProductVariantType.ESIM],
      events: [{ eventType: OrderEventType.PAYMENT_SUCCESS, createdAt: new Date('2026-10-26T04:18:00Z') }],
    });

    expect(steps[0]).toMatchObject({ label: 'Thanh toán thành công', state: 'completed' });
    expect(steps[1]).toMatchObject({ label: 'Đang lấy mã cài eSIM', state: 'active' });
  });
});
