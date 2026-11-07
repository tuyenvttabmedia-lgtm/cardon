import { Prisma } from '@prisma/client';

/**
 * Commercial revenue queries skip SUPER_ADMIN test orders.
 * JSON boolean true only. The string "true" stays in the totals.
 */
export const EXCLUDE_ADMIN_TEST_ORDERS: Prisma.OrderWhereInput = {
  NOT: {
    clientTrace: {
      path: ['adminTest'],
      equals: true,
    },
  },
};

export const EXCLUDE_ADMIN_TEST_PAYMENTS: Prisma.PaymentWhereInput = {
  order: EXCLUDE_ADMIN_TEST_ORDERS,
};
