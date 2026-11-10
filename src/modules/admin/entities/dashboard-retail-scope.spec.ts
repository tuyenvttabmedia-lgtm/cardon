import { OrderChannel, ProductVariantType } from '@prisma/client';
import { dashboardRetailOrderWhere } from './dashboard-retail-scope';

describe('dashboardRetailOrderWhere', () => {
  it('scopes B2C, excludes soft-deleted, admin-test, and ESIM variants', () => {
    const where = dashboardRetailOrderWhere();
    expect(where.deletedAt).toBeNull();
    expect(where.channel).toBe(OrderChannel.B2C);
    expect(where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          clientTrace: expect.objectContaining({ path: ['adminTest'] }),
        }),
      ]),
    );
    expect(where.NOT).toEqual({
      orderItems: {
        some: {
          variant: { type: ProductVariantType.ESIM },
        },
      },
    });
  });

  it('merges extra filters without dropping retail scope', () => {
    const where = dashboardRetailOrderWhere({
      paymentStatus: 'PAID' as never,
      fulfillmentStatus: 'PENDING' as never,
    });
    expect(where.channel).toBe(OrderChannel.B2C);
    expect(where.paymentStatus).toBe('PAID');
    expect(where.fulfillmentStatus).toBe('PENDING');
    expect(where.NOT).toBeDefined();
  });
});
