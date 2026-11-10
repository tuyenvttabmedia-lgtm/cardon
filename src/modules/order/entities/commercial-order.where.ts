import { Prisma } from '@prisma/client';

/**
 * Commercial revenue queries skip SUPER_ADMIN test orders.
 * JSON boolean true only. The string "true" stays in the totals.
 *
 * IMPORTANT: Do not use bare `NOT { path equals true }` alone.
 * On PostgreSQL a missing `adminTest` key extracts as SQL NULL, and
 * `NOT (NULL = true)` is UNKNOWN → Prisma drops every normal retail order
 * (see prisma#7836). Keep rows where the path is missing (DbNull) OR not true.
 */
export const EXCLUDE_ADMIN_TEST_ORDERS: Prisma.OrderWhereInput = {
  OR: [
    { clientTrace: { path: ['adminTest'], equals: Prisma.DbNull } },
    {
      NOT: {
        clientTrace: {
          path: ['adminTest'],
          equals: true,
        },
      },
    },
  ],
};

export const EXCLUDE_ADMIN_TEST_PAYMENTS: Prisma.PaymentWhereInput = {
  order: EXCLUDE_ADMIN_TEST_ORDERS,
};
