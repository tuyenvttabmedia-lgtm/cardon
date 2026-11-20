import {
  OrderChannel,
  Prisma,
  ProductVariantType,
} from '@prisma/client';
import { ACTIVE_ORDER_WHERE } from '../../order/entities/order.constants';
import { EXCLUDE_ADMIN_TEST_ORDERS } from '../../order/entities/commercial-order.where';

/**
 * B2C retail order scope for Operations Cockpit KPIs (aligned with Orders list
 * default channel + excludeProductType=ESIM + admin-test exclusion).
 */
export function dashboardRetailOrderWhere(
  extra: Prisma.OrderWhereInput = {},
): Prisma.OrderWhereInput {
  return {
    ...ACTIVE_ORDER_WHERE,
    ...EXCLUDE_ADMIN_TEST_ORDERS,
    channel: OrderChannel.B2C,
    NOT: {
      orderItems: {
        some: {
          variant: { type: ProductVariantType.ESIM },
        },
      },
    },
    ...extra,
  };
}

/** B2C eSIM lane (orders that contain at least one ESIM variant). */
export function dashboardEsimOrderWhere(
  extra: Prisma.OrderWhereInput = {},
): Prisma.OrderWhereInput {
  return {
    ...ACTIVE_ORDER_WHERE,
    ...EXCLUDE_ADMIN_TEST_ORDERS,
    channel: OrderChannel.B2C,
    orderItems: {
      some: {
        variant: { type: ProductVariantType.ESIM },
      },
    },
    ...extra,
  };
}
