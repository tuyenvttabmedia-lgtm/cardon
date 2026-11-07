import { CatalogProductStatus, ProductVariantStatus } from '@prisma/client';
import { ACTIVE_PRODUCT_WHERE, ACTIVE_VARIANT_WHERE } from './product.constants';

describe('ACTIVE_VARIANT_WHERE', () => {
  it('requires parent product ACTIVE and not soft-deleted', () => {
    expect(ACTIVE_VARIANT_WHERE).toEqual(
      expect.objectContaining({
        status: ProductVariantStatus.ACTIVE,
        deletedAt: null,
        product: ACTIVE_PRODUCT_WHERE,
      }),
    );
    expect(ACTIVE_VARIANT_WHERE.product).toEqual({
      status: CatalogProductStatus.ACTIVE,
      deletedAt: null,
    });
  });
});
