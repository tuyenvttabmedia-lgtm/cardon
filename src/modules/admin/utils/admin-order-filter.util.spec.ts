import { FulfillmentStatus } from '@prisma/client';
import { mapDeliveryFilter } from './admin-order-filter.util';

describe('mapDeliveryFilter', () => {
  it('maps AWAITING_DELIVERY to PENDING + WAITING_ADMIN_RETRY', () => {
    expect(mapDeliveryFilter('AWAITING_DELIVERY')).toEqual([
      FulfillmentStatus.PENDING,
      FulfillmentStatus.WAITING_ADMIN_RETRY,
    ]);
  });

  it('keeps NEED_SUPPORT as manual review + admin retry', () => {
    expect(mapDeliveryFilter('NEED_SUPPORT')).toEqual([
      FulfillmentStatus.NEED_MANUAL_REVIEW,
      FulfillmentStatus.WAITING_ADMIN_RETRY,
    ]);
  });
});
