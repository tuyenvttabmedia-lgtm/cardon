import { Prisma } from '@prisma/client';
import { EXCLUDE_ADMIN_TEST_ORDERS } from './commercial-order.where';

describe('EXCLUDE_ADMIN_TEST_ORDERS', () => {
  it('keeps missing adminTest paths via DbNull OR (Prisma/Postgres NULL trap)', () => {
    expect(EXCLUDE_ADMIN_TEST_ORDERS).toEqual({
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
    });
  });
});
