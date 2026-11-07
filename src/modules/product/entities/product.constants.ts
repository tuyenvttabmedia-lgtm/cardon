import {
  CatalogProductStatus,
  Prisma,
  ProductCategoryStatus,
  ProductVariantStatus,
  ProductVariantType,
  ProviderProductMappingStatus,
} from '@prisma/client';

export const ACTIVE_PRODUCT_WHERE: Prisma.ProductWhereInput = {
  status: CatalogProductStatus.ACTIVE,
  deletedAt: null,
};

/**
 * Sellable variant: own row ACTIVE and parent product still on sale.
 * disableProduct / softDelete product must stop create-order and agent buy even if
 * variants were left ACTIVE (no cascade).
 */
export const ACTIVE_VARIANT_WHERE: Prisma.ProductVariantWhereInput = {
  status: ProductVariantStatus.ACTIVE,
  deletedAt: null,
  product: {
    ...ACTIVE_PRODUCT_WHERE,
  },
};

export const ACTIVE_CATEGORY_WHERE: Prisma.ProductCategoryWhereInput = {
  status: ProductCategoryStatus.ACTIVE,
};

export { ProductVariantType, ProductVariantStatus, CatalogProductStatus, ProviderProductMappingStatus };
