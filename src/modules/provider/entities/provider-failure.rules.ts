import { FulfillmentStatus } from '@prisma/client';
import { ProviderFailureCode } from '../interfaces/provider.interface';

/**
 * Provider failure handling — never auto-refund customer (06_ORDER_FULFILLMENT.md).
 */
export const PROVIDER_FAILURE_RULES: Record<
  ProviderFailureCode,
  { fulfillmentStatus: FulfillmentStatus; refundCustomer: false }
> = {
  OUT_OF_STOCK: {
    fulfillmentStatus: FulfillmentStatus.WAITING_ADMIN_RETRY,
    refundCustomer: false,
  },
  LOW_BALANCE: {
    fulfillmentStatus: FulfillmentStatus.WAITING_ADMIN_RETRY,
    refundCustomer: false,
  },
  MAINTENANCE: {
    fulfillmentStatus: FulfillmentStatus.WAITING_ADMIN_RETRY,
    refundCustomer: false,
  },
  TIMEOUT: {
    fulfillmentStatus: FulfillmentStatus.WAITING_ADMIN_RETRY,
    refundCustomer: false,
  },
  UNKNOWN: {
    fulfillmentStatus: FulfillmentStatus.WAITING_ADMIN_RETRY,
    refundCustomer: false,
  },
  INVALID_SKU: {
    fulfillmentStatus: FulfillmentStatus.WAITING_ADMIN_RETRY,
    refundCustomer: false,
  },
};

export function resolveFulfillmentStatusForFailure(
  code?: ProviderFailureCode,
): FulfillmentStatus {
  if (!code) {
    return FulfillmentStatus.WAITING_ADMIN_RETRY;
  }
  return PROVIDER_FAILURE_RULES[code]?.fulfillmentStatus ??
    FulfillmentStatus.WAITING_ADMIN_RETRY;
}
